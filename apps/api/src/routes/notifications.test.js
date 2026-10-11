import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotificationPreferences } from './notifications.js';

test('notification preferences accept both boolean channel settings', () => {
  assert.deepEqual(
    parseNotificationPreferences({ inAppEnabled: false, emailEnabled: true }),
    { inAppEnabled: false, emailEnabled: true },
  );
});

test('notification preferences reject incomplete or invalid payloads', () => {
  assert.equal(parseNotificationPreferences(null), null);
  assert.equal(parseNotificationPreferences([]), null);
  assert.equal(parseNotificationPreferences({ inAppEnabled: true }), null);
  assert.equal(parseNotificationPreferences({ inAppEnabled: 1, emailEnabled: true }), null);
  assert.equal(parseNotificationPreferences({ inAppEnabled: true, emailEnabled: true, extra: false }), null);
});
