import 'dotenv/config';
import { getPool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME } = process.env;
const email = ADMIN_EMAIL?.trim().toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (
  !email ||
  !emailPattern.test(email) ||
  email.length > 255 ||
  typeof ADMIN_PASSWORD !== 'string' ||
  ADMIN_PASSWORD.length < 12 ||
  ADMIN_PASSWORD.length > 128 ||
  !ADMIN_FIRST_NAME?.trim() ||
  ADMIN_FIRST_NAME.trim().length > 100 ||
  !ADMIN_LAST_NAME?.trim() ||
  ADMIN_LAST_NAME.trim().length > 100
) {
  console.error(
    'Set ADMIN_EMAIL, ADMIN_PASSWORD (12-128 characters), ADMIN_FIRST_NAME, and ADMIN_LAST_NAME in the environment.',
  );
  process.exitCode = 1;
} else {
  let pool;
  try {
    pool = getPool();
    const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existingUsers.length > 0) {
      throw new Error('That email already has an account; the script will not change an existing role.');
    }
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified_at)
       VALUES (?, ?, ?, ?, 'admin', CURRENT_TIMESTAMP)`,
      [ADMIN_FIRST_NAME.trim(), ADMIN_LAST_NAME.trim(), email, passwordHash],
    );
    console.log(`Administrator account created for ${email}.`);
  } catch (error) {
    console.error(`Could not create administrator: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
