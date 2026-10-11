import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_REQUEST_EXPIRY_HOURS } from './expiry.js';

test('booking request expiry uses the approved 48-hour window', () => {
  assert.equal(BOOKING_REQUEST_EXPIRY_HOURS, 48);
});
