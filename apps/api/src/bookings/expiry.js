import { createNotificationForUser, emailNotificationForUser } from '../routes/notifications.js';

export const BOOKING_REQUEST_EXPIRY_HOURS = 48;
const EXPIRY_BATCH_SIZE = 100;

export async function expireOverdueBookingRequests(pool) {
  let totalExpired = 0;

  while (true) {
    const connection = await pool.getConnection();
    const expiredBookings = [];
    try {
      await connection.beginTransaction();
      const [bookings] = await connection.execute(
        `SELECT b.id, b.booking_reference, b.status, b.customer_id,
                pp.user_id AS provider_user_id
           FROM bookings b
           JOIN provider_profiles pp ON pp.id = b.provider_id
          WHERE b.status IN ('requested', 'confirmed')
            AND b.created_at <= DATE_SUB(
              CURRENT_TIMESTAMP,
              INTERVAL ${BOOKING_REQUEST_EXPIRY_HOURS} HOUR
            )
          ORDER BY b.created_at, b.id
          LIMIT ${EXPIRY_BATCH_SIZE}
          FOR UPDATE`,
      );

      for (const booking of bookings) {
        const [updated] = await connection.execute(
          `UPDATE bookings
              SET status = 'expired'
            WHERE id = ?
              AND status IN ('requested', 'confirmed')
              AND created_at <= DATE_SUB(
                CURRENT_TIMESTAMP,
                INTERVAL ${BOOKING_REQUEST_EXPIRY_HOURS} HOUR
              )`,
          [booking.id],
        );
        if (updated.affectedRows === 0) {
          continue;
        }

        await connection.execute(
          `INSERT INTO booking_status_history (
              booking_id, previous_status, new_status, changed_by, note
           )
           VALUES (?, ?, 'expired', NULL, ?)`,
          [
            booking.id,
            booking.status,
            `Automatically expired after ${BOOKING_REQUEST_EXPIRY_HOURS} hours without provider acceptance.`,
          ],
        );
        const customerNotice = {
          type: 'booking_expired',
          title: 'Booking request expired',
          message: `Booking ${booking.booking_reference} expired because the provider did not respond within ${BOOKING_REQUEST_EXPIRY_HOURS} hours.`,
        };
        const providerNotice = {
          type: 'booking_expired',
          title: 'Booking request expired',
          message: `Booking ${booking.booking_reference} expired because it was not accepted within ${BOOKING_REQUEST_EXPIRY_HOURS} hours.`,
        };
        await createNotificationForUser(connection, Number(booking.customer_id), {
          ...customerNotice,
          entityType: 'booking',
          entityId: Number(booking.id),
        });
        await createNotificationForUser(connection, Number(booking.provider_user_id), {
          ...providerNotice,
          entityType: 'booking',
          entityId: Number(booking.id),
        });
        expiredBookings.push({
          customerId: Number(booking.customer_id),
          providerUserId: Number(booking.provider_user_id),
          customerNotice,
          providerNotice,
        });
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    totalExpired += expiredBookings.length;
    for (const booking of expiredBookings) {
      await emailNotificationForUser(booking.customerId, booking.customerNotice);
      await emailNotificationForUser(booking.providerUserId, booking.providerNotice);
    }
    if (expiredBookings.length < EXPIRY_BATCH_SIZE) {
      return totalExpired;
    }
  }
}
