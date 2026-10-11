import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, originGuard } from './origin-guard.js';

test('origin checks allow the configured URL or the same network host', () => {
  assert.equal(
    isAllowedOrigin('http://localhost:3000', 'http://localhost:3000', '127.0.0.1:5000'),
    true,
  );
  assert.equal(
    isAllowedOrigin('http://10.0.0.8:3000', 'http://old-address:3000', '10.0.0.8:5000'),
    true,
  );
  assert.equal(
    isAllowedOrigin('https://10.0.0.8:3000', 'http://old-address:3000', '10.0.0.8:5000'),
    true,
  );
  assert.equal(
    isAllowedOrigin('https://attacker.example', 'http://old-address:3000', '10.0.0.8:5000'),
    false,
  );
  assert.equal(isAllowedOrigin(undefined, '', '10.0.0.8:5000'), true);
});

test('origin middleware rejects a cross-host browser origin', () => {
  let statusCode;
  let body;
  let passed = false;
  const req = {
    get: (name) => ({
      origin: 'https://attacker.example',
      host: '10.0.0.8:5000',
    }[name]),
  };
  const res = {
    status: (status) => {
      statusCode = status;
      return res;
    },
    json: (value) => {
      body = value;
      return res;
    },
  };
  originGuard('http://old-address:3000')(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(body, { message: 'Request origin is not allowed.' });
});
