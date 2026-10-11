import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRole } from './authorize-role.js';

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('role authorization rejects a missing or disallowed role', () => {
  for (const user of [undefined, { role: 'customer' }]) {
    const response = makeResponse();
    let nextCalled = false;

    authorizeRole('admin')({ user }, response, () => {
      nextCalled = true;
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { message: 'You are not authorized to access this resource.' });
    assert.equal(nextCalled, false);
  }
});

test('role authorization passes allowed users to the route', () => {
  const response = makeResponse();
  let nextCalled = false;

  authorizeRole('fundi', 'admin')({ user: { role: 'fundi' } }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, null);
  assert.equal(nextCalled, true);
});
