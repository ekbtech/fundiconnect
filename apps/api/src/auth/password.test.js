import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('password hashes verify only against the original password', async () => {
  const hash = await hashPassword('correct horse battery staple');

  assert.match(hash, /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('incorrect password', hash), false);
});

test('malformed password hashes are rejected', async () => {
  assert.equal(await verifyPassword('some password', 'not-a-valid-hash'), false);
});
