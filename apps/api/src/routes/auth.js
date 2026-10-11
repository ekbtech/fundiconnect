import { Router } from 'express';
import { createActionToken, hashActionToken, storeActionToken } from '../auth/action-token.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionToken,
  hashSessionToken,
  SESSION_TTL_DAYS,
  setSessionCookie,
} from '../auth/session.js';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, toPublicUser } from '../middleware/authenticate.js';
import { EmailDeliveryError, isEmailConfigured, sendEmail } from '../email/mailer.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedRegistrationRoles = new Set(['customer', 'fundi']);
const verificationTokenHours = 24;
const passwordResetTokenHours = 1;

function requiredName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100;
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function accountActionUrl(path, token) {
  const baseUrl = process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || 'http://localhost:3000';
  return `${baseUrl.replace(/\/+$/, '')}/${path}?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(email, token) {
  return sendEmail({
    to: email,
    subject: 'Verify your FundiConnect email',
    text: `Verify your email address by opening this link within 24 hours:\n${accountActionUrl('verify-email', token)}\n\nIf you did not create this account, you can ignore this message.`,
  });
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password } = req.body || {};
    const requestedRole = req.body?.role ?? 'customer';

    if (
      !requiredName(firstName) ||
      !requiredName(lastName) ||
      typeof email !== 'string' ||
      !emailPattern.test(email.trim()) ||
      email.trim().length > 255 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: 'Provide valid names, an email address, and a password of 8 to 128 characters.',
      });
    }

    if (!allowedRegistrationRoles.has(requestedRole)) {
      return res.status(400).json({ message: 'Role must be customer or fundi.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);
    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const verificationToken = createActionToken();
    const pool = getPool();
    const connection = await pool.getConnection();
    let registeredUser;

    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO users (first_name, last_name, email, password_hash, role)
         VALUES (?, ?, ?, ?, ?)`,
        [firstName.trim(), lastName.trim(), normalizedEmail, passwordHash, requestedRole],
      );

      if (requestedRole === 'fundi') {
        await connection.execute(
          'INSERT INTO provider_profiles (user_id) VALUES (?)',
          [result.insertId],
        );
      }

      await connection.execute(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`,
        [result.insertId, tokenHash, sessionExpiry()],
      );
      await storeActionToken(
        connection,
        result.insertId,
        'verify_email',
        verificationToken,
        verificationTokenHours,
      );

      const [users] = await connection.execute(
        `SELECT id, first_name, last_name, email, role, account_status, email_verified_at,
                profile_photo, created_at, updated_at
           FROM users WHERE id = ?`,
        [result.insertId],
      );
      registeredUser = users[0];
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }
      throw error;
    } finally {
      connection.release();
    }

    let emailDelivery = 'not_configured';
    if (isEmailConfigured()) {
      try {
        const delivery = await sendVerificationEmail(normalizedEmail, verificationToken);
        emailDelivery = delivery.sent ? 'sent' : 'not_configured';
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        console.error('Account verification email delivery failed.', error.cause || error);
        emailDelivery = 'failed';
      }
    }
    setSessionCookie(res, sessionToken);
    return res.status(201).json({
      message: emailDelivery === 'sent'
        ? 'Account created. Check your email to verify your address.'
        : 'Account created, but a verification email could not be delivered. Configure SMTP and request a new verification email.',
      emailDelivery,
      user: toPublicUser(registeredUser),
    });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      !emailPattern.test(email.trim()) ||
      email.trim().length > 255 ||
      typeof password !== 'string' ||
      password.length === 0 ||
      password.length > 128
    ) {
      return res.status(400).json({ message: 'Provide a valid email address and password.' });
    }

    const [users] = await getPool().execute(
      `SELECT id, first_name, last_name, email, password_hash, role, account_status, email_verified_at,
              profile_photo, created_at, updated_at
         FROM users WHERE email = ? LIMIT 1`,
      [email.trim().toLowerCase()],
    );

    if (users.length === 0 || !(await verifyPassword(password, users[0].password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (users[0].account_status !== 'active') {
      return res.status(403).json({ message: 'This account is suspended. Contact support for assistance.' });
    }

    const sessionToken = createSessionToken();
    await getPool().execute(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [users[0].id, hashSessionToken(sessionToken), sessionExpiry()],
    );

    setSessionCookie(res, sessionToken);
    return res.status(200).json({
      message: 'Logged in successfully.',
      user: toPublicUser(users[0]),
    });
  }),
);

router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || token.length < 40 || token.length > 128) {
      return res.status(400).json({ message: 'Provide a valid email verification token.' });
    }
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.execute(
        `SELECT id, user_id
           FROM auth_action_tokens
          WHERE token_hash = ? AND purpose = 'verify_email'
            AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          FOR UPDATE`,
        [hashActionToken(token)],
      );
      if (tokens.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'This verification link is invalid or expired. Request a new one.' });
      }
      await connection.execute(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?',
        [tokens[0].user_id],
      );
      await connection.execute(
        `UPDATE auth_action_tokens
            SET used_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND purpose = 'verify_email' AND used_at IS NULL`,
        [tokens[0].user_id],
      );
      await connection.commit();
      return res.status(200).json({ message: 'Email address verified.' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.post(
  '/verification/resend',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.emailVerifiedAt) {
      return res.status(409).json({ message: 'This email address is already verified.' });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: 'Email delivery is not configured. Set the MAIL_* environment variables.' });
    }
    const token = createActionToken();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await storeActionToken(connection, req.user.id, 'verify_email', token, verificationTokenHours);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    try {
      await sendVerificationEmail(req.user.email, token);
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      console.error('Account verification email delivery failed.', error.cause || error);
      return res.status(503).json({ message: 'The verification email could not be delivered. Try again later.' });
    }
    return res.status(200).json({ message: 'A new verification link has been sent.' });
  }),
);

router.post(
  '/password/forgot',
  asyncHandler(async (req, res) => {
    const email = req.body?.email;
    if (typeof email !== 'string' || !emailPattern.test(email.trim()) || email.trim().length > 255) {
      return res.status(400).json({ message: 'Provide a valid email address.' });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: 'Password recovery email is not configured. Contact the site administrator.' });
    }
    const [users] = await getPool().execute(
      'SELECT id, email FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()],
    );
    if (users.length > 0) {
      const token = createActionToken();
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        await storeActionToken(connection, users[0].id, 'reset_password', token, passwordResetTokenHours);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      try {
        await sendEmail({
          to: users[0].email,
          subject: 'Reset your FundiConnect password',
          text: `Reset your password by opening this link within one hour:\n${accountActionUrl('reset-password', token)}\n\nIf you did not request this, you can ignore this message.`,
        });
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        console.error('Password recovery email delivery failed.', error.cause || error);
        return res.status(503).json({ message: 'Password recovery email could not be delivered. Try again later.' });
      }
    }
    return res.status(200).json({
      message: 'If an account matches that address, a password reset link has been sent.',
    });
  }),
);

router.post(
  '/password/reset',
  asyncHandler(async (req, res) => {
    const token = req.body?.token;
    const password = req.body?.password;
    if (
      typeof token !== 'string' ||
      token.length < 40 ||
      token.length > 128 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({ message: 'Provide a valid reset link and a password of 8 to 128 characters.' });
    }

    const passwordHash = await hashPassword(password);
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.execute(
        `SELECT id, user_id
           FROM auth_action_tokens
          WHERE token_hash = ? AND purpose = 'reset_password'
            AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          FOR UPDATE`,
        [hashActionToken(token)],
      );
      if (tokens.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'This password reset link is invalid or expired. Request a new one.' });
      }
      await connection.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, tokens[0].user_id],
      );
      await connection.execute(
        `UPDATE auth_action_tokens
            SET used_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND purpose = 'reset_password' AND used_at IS NULL`,
        [tokens[0].user_id],
      );
      await connection.execute(
        `UPDATE user_sessions
            SET revoked_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND revoked_at IS NULL`,
        [tokens[0].user_id],
      );
      await connection.commit();
      return res.status(200).json({ message: 'Password reset successfully. Sign in with your new password.' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
      await getPool().execute(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE token_hash = ? AND revoked_at IS NULL`,
        [hashSessionToken(token)],
      );
    }

    clearSessionCookie(res);
    return res.status(200).json({ message: 'Logged out successfully.' });
  }),
);

router.get(
  '/session',
  authenticate,
  asyncHandler(async (req, res) => {
    return res.status(200).json({ user: req.user });
  }),
);

export default router;
