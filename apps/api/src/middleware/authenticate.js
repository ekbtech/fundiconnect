import { getPool } from '../db/pool.js';
import { getSessionToken, hashSessionToken } from '../auth/session.js';
import { asyncHandler } from './async-handler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const tokenHash = hashSessionToken(token);
  const [rows] = await getPool().execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.account_status, u.email_verified_at,
            u.profile_photo, u.created_at, u.updated_at, s.id AS session_id
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
        AND u.account_status = 'active'
      LIMIT 1`,
    [tokenHash],
  );

  if (rows.length === 0) {
    return res.status(401).json({ message: 'Session is invalid or expired.' });
  }

  req.user = toPublicUser(rows[0]);
  req.sessionId = rows[0].session_id;
  req.sessionTokenHash = tokenHash;
  return next();
});

export function toPublicUser(user) {
  return {
    id: String(user.id),
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.role,
    accountStatus: user.account_status || 'active',
    emailVerifiedAt: user.email_verified_at,
    profilePhoto: user.profile_photo
      ? `/api/v1/users/${user.id}/profile-photo`
      : null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
