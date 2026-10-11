import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { isEmailConfigured, sendEmail } from '../email/mailer.js';

const router = Router();

export async function createNotificationForUser(pool, userId, { type, title, message, entityType = null, entityId = null }) {
  if ((!userId && userId !== 0) || (typeof userId !== 'number' && typeof userId !== 'string')) {
    return null;
  }

  const normalizedType = typeof type === 'string' ? type.trim() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';

  if (!normalizedType || !normalizedTitle || !normalizedMessage) {
    return null;
  }

  const [[preferences]] = await pool.execute(
    `SELECT in_app_enabled
       FROM notification_preferences
      WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  if (preferences && !Boolean(preferences.in_app_enabled)) {
    return null;
  }

  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      normalizedType,
      normalizedTitle.slice(0, 255),
      normalizedMessage.slice(0, 1000),
      entityType || null,
      entityId ?? null,
    ],
  );

  return {
    id: result.insertId,
    userId,
    type: normalizedType,
    title: normalizedTitle.slice(0, 255),
    message: normalizedMessage.slice(0, 1000),
    entityType: entityType || null,
    entityId: entityId ?? null,
  };
}

export async function emailNotificationForUser(userId, { type, title, message }) {
  if (!isEmailConfigured()) {
    return false;
  }
  try {
    const [[user]] = await getPool().execute(
      `SELECT u.email, COALESCE(p.email_enabled, TRUE) AS email_enabled
         FROM users u
         LEFT JOIN notification_preferences p ON p.user_id = u.id
        WHERE u.id = ? LIMIT 1`,
      [userId],
    );
    if (!user?.email) {
      throw new Error('Notification recipient has no email address.');
    }
    if (!Boolean(user.email_enabled)) {
      return false;
    }
    const result = await sendEmail({
      to: user.email,
      subject: title,
      text: `${message}\n\nSign in to FundiConnect to review this update.`,
    });
    return result.sent;
  } catch (error) {
    console.error('Marketplace notification email delivery failed.', {
      userId,
      type,
      error: error.message,
    });
    return false;
  }
}

router.use(authenticate);

export function parseNotificationPreferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const entries = Object.entries(body);
  if (
    entries.length !== 2 ||
    !Object.hasOwn(body, 'inAppEnabled') ||
    !Object.hasOwn(body, 'emailEnabled') ||
    typeof body.inAppEnabled !== 'boolean' ||
    typeof body.emailEnabled !== 'boolean'
  ) {
    return null;
  }
  return {
    inAppEnabled: body.inAppEnabled,
    emailEnabled: body.emailEnabled,
  };
}

router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const [[preferences]] = await getPool().execute(
      `SELECT COALESCE(in_app_enabled, TRUE) AS in_app_enabled,
              COALESCE(email_enabled, TRUE) AS email_enabled
         FROM notification_preferences
        WHERE user_id = ? LIMIT 1`,
      [req.user.id],
    );
    return res.status(200).json({
      preferences: {
        inAppEnabled: preferences ? Boolean(preferences.in_app_enabled) : true,
        emailEnabled: preferences ? Boolean(preferences.email_enabled) : true,
      },
    });
  }),
);

router.patch(
  '/preferences',
  asyncHandler(async (req, res) => {
    const preferences = parseNotificationPreferences(req.body);
    if (!preferences) {
      return res.status(400).json({
        message: 'Provide boolean inAppEnabled and emailEnabled preferences.',
      });
    }
    await getPool().execute(
      `INSERT INTO notification_preferences (user_id, in_app_enabled, email_enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         in_app_enabled = VALUES(in_app_enabled),
         email_enabled = VALUES(email_enabled)`,
      [req.user.id, preferences.inAppEnabled, preferences.emailEnabled],
    );
    return res.status(200).json({
      message: 'Notification preferences updated.',
      preferences,
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await getPool().execute(
      `SELECT id, type, title, message, is_read, entity_type, entity_id, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      [req.user.id],
    );

    return res.status(200).json({
      notifications: rows.map((notification) => ({
        id: String(notification.id),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: Boolean(notification.is_read),
        entityType: notification.entity_type,
        entityId: notification.entity_id === null ? null : String(notification.entity_id),
        createdAt: notification.created_at,
      })),
    });
  }),
);

router.patch(
  '/:notificationId/read',
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.notificationId);
    if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
      return res.status(400).json({ message: 'Provide a valid notification ID.' });
    }

    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT id, user_id, is_read
         FROM notifications
        WHERE id = ? AND user_id = ? LIMIT 1`,
      [notificationId, req.user.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Notification was not found.' });
    }

    await pool.execute(
      `UPDATE notifications SET is_read = TRUE WHERE id = ?`,
      [notificationId],
    );

    return res.status(200).json({
      message: 'Notification marked as read.',
      notification: {
        id: String(rows[0].id),
        isRead: true,
      },
    });
  }),
);

export default router;
