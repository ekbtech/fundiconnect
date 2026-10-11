import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionToken,
  hashSessionToken,
  setSessionCookie,
} from './session.js';

test('session tokens are random URL-safe values and are stored as hashes', () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashSessionToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSessionToken(first), first);
});

test('session token is read from the named cookie', () => {
  assert.equal(
    getSessionToken({ headers: { cookie: 'theme=dark; fundiconnect_session=abc_123' } }),
    'abc_123',
  );
  assert.equal(getSessionToken({ headers: { cookie: 'theme=dark' } }), null);
});

test('session cookies are HTTP-only and can be cleared', () => {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    setSessionCookie(response, 'token');
    assert.match(response.headers['Set-Cookie'], /HttpOnly/);
    assert.match(response.headers['Set-Cookie'], /SameSite=Lax/);
    assert.doesNotMatch(response.headers['Set-Cookie'], /Secure/);

    clearSessionCookie(response);
    assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
