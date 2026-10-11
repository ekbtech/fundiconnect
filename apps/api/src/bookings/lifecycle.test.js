import test from 'node:test';
import assert from 'node:assert/strict';
import { jobTransitions, validateFundiBookingUpdate } from './lifecycle.js';

test('job lifecycle allows only the documented provider transitions', () => {
  assert.equal(jobTransitions.in_progress.has('completed'), true);
  assert.equal(jobTransitions.requested.has('expired'), true);
  assert.equal(jobTransitions.confirmed.has('expired'), true);
  assert.equal(jobTransitions.accepted.has('expired'), false);
  assert.equal(jobTransitions.completed, undefined);
  assert.equal(jobTransitions.in_progress.has('closed'), false);
  assert.equal(jobTransitions.requested.has('in_progress'), false);
});

test('completion requires a trimmed summary between 10 and 2000 characters', () => {
  assert.deepEqual(
    validateFundiBookingUpdate({
      status: 'completed',
      completionSummary: '  Replaced the damaged kitchen tap.  ',
    }),
    {
      status: 'completed',
      reason: '',
      completionSummary: 'Replaced the damaged kitchen tap.',
    },
  );
  assert.equal(validateFundiBookingUpdate({ status: 'completed' }), null);
  assert.equal(
    validateFundiBookingUpdate({ status: 'completed', completionSummary: 'Too short' }),
    null,
  );
  assert.equal(
    validateFundiBookingUpdate({
      status: 'completed',
      completionSummary: 'x'.repeat(2001),
    }),
    null,
  );
});

test('non-completion updates reject completion summaries and require decline reasons', () => {
  assert.equal(validateFundiBookingUpdate(null), null);
  assert.equal(validateFundiBookingUpdate([]), null);
  assert.equal(
    validateFundiBookingUpdate({
      status: 'accepted',
      completionSummary: 'This field is not valid here.',
    }),
    null,
  );
  assert.equal(validateFundiBookingUpdate({ status: 'rejected' }), null);
  assert.deepEqual(validateFundiBookingUpdate({ status: 'rejected', reason: 'No capacity' }), {
    status: 'rejected',
    reason: 'No capacity',
    completionSummary: null,
  });
});
