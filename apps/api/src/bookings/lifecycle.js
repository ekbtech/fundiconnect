export const jobTransitions = {
  requested: new Set(['accepted', 'rejected', 'expired']),
  confirmed: new Set(['accepted', 'rejected', 'expired']),
  accepted: new Set(['in_progress']),
  in_progress: new Set(['completed']),
};

const jobStatuses = new Set(['accepted', 'rejected', 'in_progress', 'completed']);

export function validateFundiBookingUpdate(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const { status, reason, completionSummary } = body;
  if (
    !jobStatuses.has(status) ||
    (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000)) ||
    (status === 'rejected' && (typeof reason !== 'string' || reason.trim().length < 3)) ||
    (status === 'completed' &&
      (typeof completionSummary !== 'string' ||
        completionSummary.trim().length < 10 ||
        completionSummary.trim().length > 2000)) ||
    (status !== 'completed' && completionSummary !== undefined)
  ) {
    return null;
  }

  return {
    status,
    reason: typeof reason === 'string' ? reason.trim() : '',
    completionSummary: status === 'completed' ? completionSummary.trim() : null,
  };
}
