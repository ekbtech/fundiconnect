import { createHash, randomBytes } from 'node:crypto';

export function createActionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashActionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function storeActionToken(connection, userId, purpose, token, ttlHours) {
  await connection.execute(
    `UPDATE auth_action_tokens
        SET used_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
    [userId, purpose],
  );
  await connection.execute(
    `INSERT INTO auth_action_tokens (user_id, purpose, token_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR))`,
    [userId, purpose, hashActionToken(token), ttlHours],
  );
}
