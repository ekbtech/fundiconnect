import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionToken, hashActionToken } from './action-token.js';

test('account action tokens are random, URL-safe, and stored as hashes', () => {
  const first = createActionToken();
  const second = createActionToken();
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
  assert.match(hashActionToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashActionToken(first), first);
});
