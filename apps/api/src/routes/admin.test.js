import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidAccountStatusChange,
  isValidComplaintStatusTransition,
  isValidReviewModeration,
  parseCategory,
} from './admin.js';
import {
  normalizeComplaintStatus,
  normalizeReviewComment,
} from './reviews.js';

test('complaint moderation follows allowed status transitions', () => {
  assert.equal(isValidComplaintStatusTransition('open', 'investigating'), true);
  assert.equal(isValidComplaintStatusTransition('investigating', 'resolved'), true);
  assert.equal(isValidComplaintStatusTransition('resolved', 'investigating'), true);
  assert.equal(isValidComplaintStatusTransition('closed', 'investigating'), false);
  assert.equal(isValidComplaintStatusTransition('open', 'unknown'), false);
});

test('account suspension and restoration require a valid state change and reason', () => {
  assert.equal(isValidAccountStatusChange('active', 'suspended', 'Policy violation'), true);
  assert.equal(isValidAccountStatusChange('suspended', 'active', 'Appeal approved'), true);
  assert.equal(isValidAccountStatusChange('active', 'active', 'No change'), false);
  assert.equal(isValidAccountStatusChange('unknown', 'suspended', 'Policy violation'), false);
  assert.equal(isValidAccountStatusChange('active', 'suspended', '  '), false);
  assert.equal(isValidAccountStatusChange('active', 'suspended', 'x'.repeat(1001)), false);
});

test('new complaints default to open and reject invalid requested states', () => {
  assert.equal(normalizeComplaintStatus(undefined), 'open');
  assert.equal(normalizeComplaintStatus('open'), 'open');
  assert.equal(normalizeComplaintStatus('closed'), 'closed');
  assert.equal(normalizeComplaintStatus('unknown'), null);
});

test('review text is optional but validates supplied content', () => {
  assert.equal(normalizeReviewComment(undefined), '');
  assert.equal(normalizeReviewComment(null), '');
  assert.equal(normalizeReviewComment('  helpful and professional  '), 'helpful and professional');
  assert.equal(normalizeReviewComment('x'.repeat(2001)), null);
});

test('review moderation requires a visibility state and a bounded reason', () => {
  assert.equal(isValidReviewModeration(false, 'Contains personal information'), true);
  assert.equal(isValidReviewModeration(true, 'Appeal reviewed'), true);
  assert.equal(isValidReviewModeration('false', 'Contains personal information'), false);
  assert.equal(isValidReviewModeration(false, '  '), false);
  assert.equal(isValidReviewModeration(false, 'x'.repeat(1001)), false);
});

test('category input validates required fields, slugs, and partial updates', () => {
  assert.deepEqual(
    parseCategory({ name: 'Plumbing', slug: 'plumbing', description: 'Water services' }),
    { name: 'Plumbing', slug: 'plumbing', description: 'Water services' },
  );
  assert.deepEqual(parseCategory({ isActive: false }, true), { isActive: false });
  assert.equal(parseCategory({ name: 'Plumbing', slug: 'Invalid Slug' }), null);
  assert.equal(parseCategory({ name: 'x', slug: 'x' }), null);
  assert.equal(parseCategory({ name: 'Plumbing' }), null);
  assert.equal(parseCategory({ isActive: 'false' }, true), null);
  assert.equal(parseCategory({ unknown: 'value' }, true), null);
});
