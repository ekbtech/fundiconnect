import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fundiconnect_session';
export const SESSION_TTL_DAYS = 7;

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || '';

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const name = cookie.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      return cookie.slice(separator + 1).trim();
    }
  }

  return null;
}

export function setSessionCookie(res, token) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/api/v1',
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function clearSessionCookie(res) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/api/v1',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  res.setHeader('Set-Cookie', attributes.join('; '));
}
