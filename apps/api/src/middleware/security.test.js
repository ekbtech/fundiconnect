import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import {
  createJsonRateLimiter,
  securityHeaders,
} from './security.js';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('API security headers include browser hardening and permit frontend image requests', async () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/', (_req, res) => res.sendStatus(200));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  });
});

test('rate limiter returns a structured 429 response and standard rate-limit headers', async () => {
  const app = express();
  app.use(createJsonRateLimiter({
    limit: 2,
    message: 'Slow down.',
  }));
  app.get('/', (_req, res) => res.json({ status: 'ok' }));

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(baseUrl)).status, 200);
    assert.equal((await fetch(baseUrl)).status, 200);
    const limited = await fetch(baseUrl);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { message: 'Slow down.' });
    assert.ok(limited.headers.get('ratelimit'));
    assert.equal(limited.headers.get('x-ratelimit-limit'), null);
  });
});
