import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManuallyUpdatePaymentStatus,
  isValidPaymentTransition,
  normalizeCurrency,
} from './payments.js';

test('payment state transitions follow the documented lifecycle', () => {
  assert.equal(isValidPaymentTransition('pending', 'successful'), true);
  assert.equal(isValidPaymentTransition('pending', 'failed'), true);
  assert.equal(isValidPaymentTransition('successful', 'refunded'), true);
  assert.equal(isValidPaymentTransition('failed', 'successful'), false);
  assert.equal(isValidPaymentTransition('refunded', 'successful'), false);
});

test('only an administrator with a reason can manually change payment status', () => {
  assert.equal(canManuallyUpdatePaymentStatus('admin', 'pending', 'successful', 'Cash receipt verified'), true);
  assert.equal(canManuallyUpdatePaymentStatus('customer', 'pending', 'successful', 'Receipt'), false);
  assert.equal(canManuallyUpdatePaymentStatus('fundi', 'pending', 'successful', 'Receipt'), false);
  assert.equal(canManuallyUpdatePaymentStatus('admin', 'pending', 'successful', ''), false);
  assert.equal(canManuallyUpdatePaymentStatus('admin', 'pending', 'successful', 'x'.repeat(1001)), false);
  assert.equal(canManuallyUpdatePaymentStatus('admin', 'failed', 'successful', 'Retry'), false);
});

test('payment currency defaults only when omitted and rejects invalid input', () => {
  assert.equal(normalizeCurrency(undefined), 'KES');
  assert.equal(normalizeCurrency('kes'), 'KES');
  assert.equal(normalizeCurrency('invalid currency'), null);
  assert.equal(normalizeCurrency(123), null);
});
