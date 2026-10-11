import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, toPublicUser } from '../middleware/authenticate.js';
import {
  photoUpload,
  readPhoto,
  removePhoto,
  removeStoredPhoto,
  storePhoto,
  validatePhoto,
} from '../uploads/media.js';

const router = Router();

router.get(
  '/:userId/profile-photo',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Provide a valid user ID.' });
    }
    const [[user]] = await getPool().execute(
      'SELECT profile_photo FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!user?.profile_photo) {
      return res.status(404).json({ message: 'Profile photo was not found.' });
    }
    const match = /^([0-9a-f-]{36})\.(jpg|png)$/i.exec(user.profile_photo);
    if (!match) {
      return res.status(404).json({ message: 'Profile photo was not found.' });
    }
    const contents = await readPhoto('profile', match[1], match[2]);
    if (!contents) {
      return res.status(404).json({ message: 'Profile photo file was not found.' });
    }
    res.set({
      'Cache-Control': 'public, max-age=300',
      'Content-Length': contents.length,
      'Content-Type': match[2] === 'jpg' ? 'image/jpeg' : 'image/png',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(contents);
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return res.status(200).json({ user: req.user });
  }),
);

router.post(
  '/me/profile-photo',
  authenticate,
  photoUpload.single('photo'),
  asyncHandler(async (req, res) => {
    const photo = validatePhoto(req.file);
    if (!photo) {
      return res.status(400).json({ message: 'Choose a valid JPEG or PNG photo no larger than 5 MB.' });
    }
    const storageKey = `${photo.storageKey}.${photo.extension}`;
    const connection = await getPool().getConnection();
    let storedPath = null;
    let previousPhoto = null;
    try {
      await connection.beginTransaction();
      const [[user]] = await connection.execute(
        'SELECT profile_photo FROM users WHERE id = ? FOR UPDATE',
        [req.user.id],
      );
      if (!user) {
        await connection.rollback();
        return res.status(404).json({ message: 'User profile was not found.' });
      }
      previousPhoto = user.profile_photo;
      storedPath = await storePhoto('profile', photo.storageKey, photo.extension, req.file.buffer);
      await connection.execute(
        'UPDATE users SET profile_photo = ? WHERE id = ?',
        [storageKey, req.user.id],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (storedPath) {
        try {
          await removePhoto(storedPath);
        } catch (cleanupError) {
          console.error('Could not remove an unlinked profile photo.', cleanupError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
    const previousPhotoMatch = /^([0-9a-f-]{36})\.(jpg|png)$/i.exec(previousPhoto || '');
    if (previousPhotoMatch) {
      try {
        await removeStoredPhoto('profile', previousPhotoMatch[1], previousPhotoMatch[2]);
      } catch (cleanupError) {
        console.error('Could not remove a replaced profile photo.', cleanupError);
      }
    }
    return res.status(200).json({
      message: 'Profile photo updated.',
      profilePhoto: `/api/v1/users/${req.user.id}/profile-photo`,
    });
  }),
);

router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const allowedFields = new Set(['firstName', 'lastName']);
    const entries = Object.entries(req.body || {});

    if (
      entries.length === 0 ||
      entries.some(([field, value]) =>
        !allowedFields.has(field) ||
        typeof value !== 'string' ||
        value.trim().length === 0 ||
        value.trim().length > 100,
      )
    ) {
      return res.status(400).json({
        message: 'Only firstName and lastName can be updated; each must be 1 to 100 characters.',
      });
    }

    const values = [];
    const assignments = entries.map(([field, value]) => {
      const column = field === 'firstName' ? 'first_name' : 'last_name';
      values.push(value.trim());
      return `${column} = ?`;
    });
    values.push(req.user.id);

    await getPool().execute(
      `UPDATE users SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );

    const [users] = await getPool().execute(
      `SELECT id, first_name, last_name, email, role, email_verified_at,
              profile_photo, created_at, updated_at
         FROM users WHERE id = ?`,
      [req.user.id],
    );

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: toPublicUser(users[0]),
    });
  }),
);

export default router;
