const NAIROBI_TIME_ZONE = 'Africa/Nairobi';
const LOCAL_APPOINTMENT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function nairobiDateTime(date) {
  const values = new Map(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: NAIROBI_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${values.get('year')}-${values.get('month')}-${values.get('day')} ${values.get('hour')}:${values.get('minute')}:${values.get('second')}`;
}

export function normalizeAppointment(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const input = value.trim();
  const date = new Date(
    LOCAL_APPOINTMENT_PATTERN.test(input) ? `${input}:00+03:00` : input,
  );
  if (Number.isNaN(date.getTime()) || date.getTime() < now + 60_000) {
    return null;
  }
  const normalized = nairobiDateTime(date);
  if (
    LOCAL_APPOINTMENT_PATTERN.test(input) &&
    normalized !== `${input.replace('T', ' ')}:00`
  ) {
    return null;
  }
  return normalized;
}

export function parseWeeklyAvailability(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const availability = [];
  for (const slot of value) {
    if (
      !slot ||
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 0 ||
      slot.weekday > 6 ||
      typeof slot.startTime !== 'string' ||
      typeof slot.endTime !== 'string' ||
      !CLOCK_PATTERN.test(slot.startTime) ||
      !CLOCK_PATTERN.test(slot.endTime) ||
      slot.startTime >= slot.endTime
    ) {
      return null;
    }
    availability.push({
      weekday: slot.weekday,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  }
  const byWeekday = new Map();
  for (const slot of availability) {
    const windows = byWeekday.get(slot.weekday) || [];
    windows.push(slot);
    byWeekday.set(slot.weekday, windows);
  }
  for (const windows of byWeekday.values()) {
    windows.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < windows.length; index += 1) {
      if (windows[index].startTime < windows[index - 1].endTime) {
        return null;
      }
    }
  }
  return availability;
}

export async function validateProviderAppointment(
  connection,
  providerId,
  requestedAt,
  durationHours,
  excludedBookingId = null,
) {
  const durationSeconds = (durationHours || 1) * 60 * 60;
  const [slots] = await connection.execute(
    `SELECT id
       FROM provider_availability
      WHERE provider_id = ?
        AND weekday = DAYOFWEEK(?) - 1
        AND TIMESTAMP(DATE(?), start_time) <= ?
        AND TIMESTAMP(DATE(?), end_time) >= DATE_ADD(?, INTERVAL ? SECOND)
      LIMIT 1`,
    [providerId, requestedAt, requestedAt, requestedAt, requestedAt, durationSeconds],
  );
  if (slots.length === 0) {
    return "The requested appointment is outside the provider's published availability.";
  }

  const [conflicts] = await connection.execute(
    `SELECT b.id
       FROM bookings b
       JOIN services s ON s.id = b.service_id
      WHERE b.provider_id = ?
        AND b.status IN ('requested', 'quoted', 'confirmed', 'accepted', 'in_progress')
        AND (? IS NULL OR b.id <> ?)
        AND b.requested_at < DATE_ADD(?, INTERVAL ? SECOND)
        AND DATE_ADD(
              b.requested_at,
              INTERVAL COALESCE(s.estimated_duration_hours, 1) HOUR
            ) > ?
      LIMIT 1`,
    [
      providerId,
      excludedBookingId,
      excludedBookingId,
      requestedAt,
      durationSeconds,
      requestedAt,
    ],
  );
  return conflicts.length > 0
    ? 'The provider already has a booking that overlaps this appointment.'
    : null;
}
