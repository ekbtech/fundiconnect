export function isValidDeletionDecision(status, reason) {
  return (
    ['approved', 'rejected'].includes(status) &&
    typeof reason === 'string' &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 1000
  );
}

export function getAnonymizedEmail(userId) {
  const normalizedId = String(userId);
  if (!/^\d{1,20}$/.test(normalizedId)) {
    throw new Error('Provide a valid user ID to anonymize.');
  }
  return `deleted+${normalizedId}@deleted.invalid`;
}
