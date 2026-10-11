import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAppointment,
  parseWeeklyAvailability,
} from './availability.js';

test('appointment times are validated and stored in East Africa local time', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  assert.equal(
    normalizeAppointment('2026-10-02T09:15', now),
    '2026-10-02 09:15:00',
  );
  assert.equal(
    normalizeAppointment('2026-10-02T09:15:00Z', now),
    '2026-10-02 12:15:00',
  );
  assert.equal(normalizeAppointment('2026-02-30T09:15', now), null);
  assert.equal(normalizeAppointment('2026-09-30T09:15', now), null);
  assert.equal(normalizeAppointment('not-a-date', now), null);
});

test('weekly provider availability allows multiple non-overlapping windows per weekday', () => {
  assert.deepEqual(
    parseWeeklyAvailability([
      { weekday: 1, startTime: '09:00', endTime: '12:00' },
      { weekday: 1, startTime: '13:00', endTime: '17:00' },
      { weekday: 6, startTime: '10:30', endTime: '14:00' },
    ]),
    [
      { weekday: 1, startTime: '09:00', endTime: '12:00' },
      { weekday: 1, startTime: '13:00', endTime: '17:00' },
      { weekday: 6, startTime: '10:30', endTime: '14:00' },
    ],
  );
  assert.deepEqual(parseWeeklyAvailability([]), []);
  assert.equal(
    parseWeeklyAvailability([
      { weekday: 1, startTime: '09:00', endTime: '13:00' },
      { weekday: 1, startTime: '12:59', endTime: '17:00' },
    ]),
    null,
  );
  assert.equal(
    parseWeeklyAvailability([
      { weekday: 1, startTime: '09:00', endTime: '13:00' },
      { weekday: 1, startTime: '13:00', endTime: '17:00' },
    ])?.length,
    2,
  );
  assert.equal(
    parseWeeklyAvailability([{ weekday: 0, startTime: '17:00', endTime: '09:00' }]),
    null,
  );
  assert.equal(
    parseWeeklyAvailability([{ weekday: 7, startTime: '09:00', endTime: '17:00' }]),
    null,
  );
});
