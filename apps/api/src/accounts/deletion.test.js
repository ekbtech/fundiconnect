import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnonymizedEmail, isValidDeletionDecision } from './deletion.js';

test('deletion decisions require an allowed outcome and bounded reason', () => {
  assert.equal(isValidDeletionDecision('approved', 'Identity confirmed'), true);
  assert.equal(isValidDeletionDecision('rejected', 'Records must be retained'), true);
  assert.equal(isValidDeletionDecision('cancelled', 'Request withdrawn'), false);
  assert.equal(isValidDeletionDecision('approved', '  '), false);
  assert.equal(isValidDeletionDecision('approved', 'x'.repeat(1001)), false);
});

test('anonymized emails are unique per numeric account ID', () => {
  assert.equal(getAnonymizedEmail('482'), 'deleted+482@deleted.invalid');
  assert.throws(() => getAnonymizedEmail('4; DROP TABLE users'));
});
