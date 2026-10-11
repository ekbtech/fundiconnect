import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { normalizeAppointment, validateProviderAppointment } from '../bookings/availability.js';
import {
  BOOKING_REQUEST_EXPIRY_HOURS,
  expireOverdueBookingRequests,
} from '../bookings/expiry.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import { createNotificationForUser, emailNotificationForUser } from './notifications.js';

const router = Router();

function sanitizeText(value, maxLength, fieldName) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

function parseBookingPrice(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999999) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function buildBookingQuery(user) {
  const params = [];
  let whereClause = '';

  if (user.role === 'customer') {
    whereClause = 'WHERE b.customer_id = ?';
    params.push(user.id);
  } else if (user.role === 'fundi') {
    whereClause = `WHERE b.provider_id = (
      SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1
    )`;
    params.push(user.id);
  }

  return {
    query: `
      SELECT b.id, b.booking_reference, b.requested_at, b.location, b.job_description,
             b.agreed_price, b.status, b.completion_summary, b.completed_at,
             b.completion_confirmed_at, b.created_at,
             EXISTS(SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS is_reviewed,
             s.id AS service_id, s.name AS service_name,
             pp.id AS provider_profile_id, pp.business_name AS provider_business_name,
             pp.verification_status AS provider_verification_status,
             provider_user.id AS provider_user_id,
             provider_user.first_name AS provider_first_name,
             provider_user.last_name AS provider_last_name,
             customer_user.id AS customer_user_id,
             customer_user.first_name AS customer_first_name,
             customer_user.last_name AS customer_last_name
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        JOIN provider_profiles pp ON pp.id = b.provider_id
        JOIN users provider_user ON provider_user.id = pp.user_id
        JOIN users customer_user ON customer_user.id = b.customer_id
      ${whereClause}
      ORDER BY b.requested_at DESC, b.id DESC`,
    params,
  };
}

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const { query, params } = buildBookingQuery(req.user);
    const [rows] = await getPool().execute(query, params);

    return res.status(200).json({
      bookings: rows.map((booking) => ({
        id: String(booking.id),
        bookingReference: booking.booking_reference,
        requestedAt: booking.requested_at,
        location: booking.location,
        jobDescription: booking.job_description,
        agreedPrice: booking.agreed_price === null ? null : Number(booking.agreed_price),
        status: booking.status,
        completionSummary: booking.completion_summary,
        completedAt: booking.completed_at,
        completionConfirmedAt: booking.completion_confirmed_at,
        isReviewed: Boolean(booking.is_reviewed),
        createdAt: booking.created_at,
        service: {
          id: String(booking.service_id),
          name: booking.service_name,
        },
        provider: {
          id: String(booking.provider_profile_id),
          businessName: booking.provider_business_name,
          verificationStatus: booking.provider_verification_status,
          user: {
            id: String(booking.provider_user_id),
            firstName: booking.provider_first_name,
            lastName: booking.provider_last_name,
          },
        },
        customer: {
          id: String(booking.customer_user_id),
          firstName: booking.customer_first_name,
          lastName: booking.customer_last_name,
        },
      })),
    });
  }),
);

router.get(
  '/:bookingId',
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const bookingId = Number(req.params.bookingId);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({ message: 'Provide a valid booking ID.' });
    }

    let ownershipClause = 'WHERE b.id = ?';
    const params = [bookingId];

    if (req.user.role === 'customer') {
      ownershipClause += ' AND b.customer_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'fundi') {
      ownershipClause += ` AND b.provider_id = (
        SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1
      )`;
      params.push(req.user.id);
    }

    const [rows] = await getPool().execute(
      `SELECT b.id, b.booking_reference, b.requested_at, b.location, b.job_description,
              b.agreed_price, b.status, b.completion_summary, b.completed_at,
              b.completion_confirmed_at, b.created_at,
              s.id AS service_id, s.name AS service_name,
              pp.id AS provider_profile_id, pp.business_name AS provider_business_name,
              pp.verification_status AS provider_verification_status,
              provider_user.id AS provider_user_id,
              provider_user.first_name AS provider_first_name,
              provider_user.last_name AS provider_last_name,
              customer_user.id AS customer_user_id,
              customer_user.first_name AS customer_first_name,
              customer_user.last_name AS customer_last_name
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN provider_profiles pp ON pp.id = b.provider_id
         JOIN users provider_user ON provider_user.id = pp.user_id
         JOIN users customer_user ON customer_user.id = b.customer_id
        ${ownershipClause}
        LIMIT 1`,
      params,
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Booking was not found.' });
    }

    const booking = rows[0];
    return res.status(200).json({
      booking: {
        id: String(booking.id),
        bookingReference: booking.booking_reference,
        requestedAt: booking.requested_at,
        location: booking.location,
        jobDescription: booking.job_description,
        agreedPrice: booking.agreed_price === null ? null : Number(booking.agreed_price),
        status: booking.status,
        completionSummary: booking.completion_summary,
        completedAt: booking.completed_at,
        completionConfirmedAt: booking.completion_confirmed_at,
        createdAt: booking.created_at,
        service: {
          id: String(booking.service_id),
          name: booking.service_name,
        },
        provider: {
          id: String(booking.provider_profile_id),
          businessName: booking.provider_business_name,
          verificationStatus: booking.provider_verification_status,
          user: {
            id: String(booking.provider_user_id),
            firstName: booking.provider_first_name,
            lastName: booking.provider_last_name,
          },
        },
        customer: {
          id: String(booking.customer_user_id),
          firstName: booking.customer_first_name,
          lastName: booking.customer_last_name,
        },
      },
    });
  }),
);

router.patch(
  '/:bookingId/confirm-completion',
  authorizeRole('customer'),
  asyncHandler(async (req, res) => {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({ message: 'Provide a valid booking ID.' });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[booking]] = await connection.execute(
        `SELECT b.id, b.status, b.booking_reference, pp.user_id AS provider_user_id
           FROM bookings b
           JOIN provider_profiles pp ON pp.id = b.provider_id
          WHERE b.id = ? AND b.customer_id = ?
          FOR UPDATE`,
        [bookingId, req.user.id],
      );
      if (!booking) {
        await connection.rollback();
        return res.status(404).json({ message: 'Booking was not found.' });
      }
      if (booking.status !== 'completed') {
        await connection.rollback();
        return res.status(409).json({
          message: 'Only work marked complete by the provider can be confirmed.',
        });
      }

      await connection.execute(
        `UPDATE bookings
            SET status = 'closed', completion_confirmed_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [bookingId],
      );
      await connection.execute(
        `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by, note)
         VALUES (?, 'completed', 'closed', ?, 'Customer confirmed completion.')`,
        [bookingId, req.user.id],
      );
      const notification = {
        type: 'booking_closed',
        title: 'Customer confirmed completion',
        message: `The customer confirmed completion of booking ${booking.booking_reference}.`,
      };
      await createNotificationForUser(connection, Number(booking.provider_user_id), {
        ...notification,
        entityType: 'booking',
        entityId: bookingId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(booking.provider_user_id), notification);
      return res.status(200).json({ message: 'Job completion confirmed.', status: 'closed' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  '/:bookingId/history',
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const bookingId = Number(req.params.bookingId);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({ message: 'Provide a valid booking ID.' });
    }
    const params = [bookingId];
    let ownershipFilter = '';
    if (req.user.role === 'customer') {
      ownershipFilter = 'AND b.customer_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'fundi') {
      ownershipFilter = `AND b.provider_id = (
        SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1
      )`;
      params.push(req.user.id);
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to view this booking history.' });
    }

    const pool = getPool();
    const [bookings] = await pool.execute(
      `SELECT b.id FROM bookings b WHERE b.id = ? ${ownershipFilter} LIMIT 1`,
      params,
    );
    if (bookings.length === 0) {
      return res.status(404).json({ message: 'Booking was not found.' });
    }
    const [statusHistory] = await pool.execute(
      `SELECT h.previous_status, h.new_status, h.note, h.created_at,
              u.first_name, u.last_name, u.role
         FROM booking_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.booking_id = ?
        ORDER BY h.created_at ASC, h.id ASC`,
      [bookingId],
    );
    const [scheduleHistory] = await pool.execute(
      `SELECT h.previous_requested_at, h.requested_at, h.reason, h.created_at,
              u.first_name, u.last_name, u.role
         FROM booking_schedule_history h
         JOIN users u ON u.id = h.changed_by
        WHERE h.booking_id = ?
        ORDER BY h.created_at ASC, h.id ASC`,
      [bookingId],
    );
    return res.status(200).json({
      statusHistory: statusHistory.map((entry) => ({
        previousStatus: entry.previous_status,
        status: entry.new_status,
        note: entry.note,
        changedAt: entry.created_at,
        changedBy: entry.first_name ? `${entry.first_name} ${entry.last_name}` : 'System',
        actorRole: entry.role,
      })),
      scheduleHistory: scheduleHistory.map((entry) => ({
        previousRequestedAt: entry.previous_requested_at,
        requestedAt: entry.requested_at,
        reason: entry.reason,
        changedAt: entry.created_at,
        changedBy: `${entry.first_name} ${entry.last_name}`,
        actorRole: entry.role,
      })),
    });
  }),
);

router.post(
  '/',
  authorizeRole('customer'),
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.body?.serviceId);
    const requestedAt = normalizeAppointment(req.body?.requestedAt);
    const location = sanitizeText(req.body?.location, 255, 'location');
    const jobDescription = sanitizeText(req.body?.jobDescription, 5000, 'jobDescription');
    const agreedPrice = parseBookingPrice(req.body?.agreedPrice);

    if (
      !Number.isSafeInteger(serviceId) ||
      serviceId < 1 ||
      !requestedAt ||
      !location ||
      !jobDescription ||
      (req.body?.agreedPrice !== undefined && req.body?.agreedPrice !== null && agreedPrice === null)
    ) {
      return res.status(400).json({
        message: 'Provide a valid serviceId, requestedAt, location, and jobDescription. When provided, agreedPrice must be a valid amount.',
      });
    }

    if (!requestedAt) {
      return res.status(400).json({ message: 'Choose a valid appointment time in the future.' });
    }

    const pool = getPool();
    const [[service]] = await pool.execute(
      `SELECT s.id, s.provider_id, s.is_active, s.pricing_model, s.price,
              s.estimated_duration_hours,
              pp.user_id AS provider_user_id, pp.verification_status, pp.is_verified
         FROM services s
         JOIN provider_profiles pp ON pp.id = s.provider_id
        WHERE s.id = ? LIMIT 1`,
      [serviceId],
    );

    if (!service) {
      return res.status(404).json({ message: 'Service was not found.' });
    }

    if (!service.is_active) {
      return res.status(400).json({ message: 'This service is no longer active.' });
    }

    if (service.provider_user_id === req.user.id) {
      return res.status(400).json({ message: 'You cannot book your own service listing.' });
    }

    if (service.verification_status !== 'approved' || !service.is_verified) {
      return res.status(400).json({ message: 'The provider must be verified before a booking can be created.' });
    }

    const calculatedPrice =
      agreedPrice === null
        ? service.pricing_model === 'quote'
          ? null
          : Number(service.price ?? 0)
        : agreedPrice;

    if (
      service.pricing_model !== 'quote' &&
      (!Number.isFinite(calculatedPrice) || calculatedPrice < 0 || calculatedPrice > 99999999)
    ) {
      return res.status(400).json({ message: 'The service price must be valid for the selected pricing model.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'SELECT id FROM provider_profiles WHERE id = ? FOR UPDATE',
        [service.provider_id],
      );
      const availabilityError = await validateProviderAppointment(
        connection,
        service.provider_id,
        requestedAt,
        service.estimated_duration_hours,
      );
      if (availabilityError) {
        await connection.rollback();
        return res.status(409).json({ message: availabilityError });
      }

      const bookingReference = `FC-${randomUUID().replaceAll('-', '').slice(0, 30).toUpperCase()}`;
      const [result] = await connection.execute(
        `INSERT INTO bookings (
            customer_id, provider_id, service_id, booking_reference,
            requested_at, location, job_description, agreed_price, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested')`,
        [
          req.user.id,
          service.provider_id,
          service.id,
          bookingReference,
          requestedAt,
          location,
          jobDescription,
          calculatedPrice,
        ],
      );
      await connection.execute(
        `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by, note)
         VALUES (?, NULL, 'requested', ?, ?)`,
        [result.insertId, req.user.id, 'Booking requested by customer.'],
      );
      const notification = {
        type: 'booking_requested',
        title: 'New booking request',
        message: `You received a booking request for ${requestedAt}.`,
      };
      await createNotificationForUser(connection, Number(service.provider_user_id), {
        ...notification,
        entityType: 'booking',
        entityId: result.insertId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(service.provider_user_id), notification);

      return res.status(201).json({
        message: 'Booking requested successfully.',
        booking: {
          id: String(result.insertId),
          bookingReference,
          requestedAt,
          location,
          jobDescription,
          agreedPrice: calculatedPrice,
          status: 'requested',
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.patch(
  '/:bookingId/schedule',
  authorizeRole('customer'),
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const bookingId = Number(req.params.bookingId);
    const requestedAt = normalizeAppointment(req.body?.requestedAt);
    const reason = sanitizeText(req.body?.reason, 1000);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1 || !requestedAt || !reason || reason.length < 3) {
      return res.status(400).json({
        message: 'Provide a valid booking ID, future appointment time, and rescheduling reason.',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[booking]] = await connection.execute(
        `SELECT b.id, b.provider_id, b.service_id, b.requested_at, b.status,
                b.created_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${BOOKING_REQUEST_EXPIRY_HOURS} HOUR) AS request_expired,
                s.estimated_duration_hours, pp.user_id AS provider_user_id
           FROM bookings b
           JOIN services s ON s.id = b.service_id
           JOIN provider_profiles pp ON pp.id = b.provider_id
          WHERE b.id = ? AND b.customer_id = ?
          FOR UPDATE`,
        [bookingId, req.user.id],
      );
      if (!booking) {
        await connection.rollback();
        return res.status(404).json({ message: 'Booking was not found.' });
      }
      if (
        ['requested', 'confirmed'].includes(booking.status) &&
        Boolean(booking.request_expired)
      ) {
        await connection.rollback();
        await expireOverdueBookingRequests(getPool());
        return res.status(409).json({ message: 'This booking request has expired.' });
      }
      if (!['requested', 'confirmed', 'accepted'].includes(booking.status)) {
        await connection.rollback();
        return res.status(409).json({ message: 'This booking can no longer be rescheduled.' });
      }

      await connection.execute(
        'SELECT id FROM provider_profiles WHERE id = ? FOR UPDATE',
        [booking.provider_id],
      );
      const availabilityError = await validateProviderAppointment(
        connection,
        booking.provider_id,
        requestedAt,
        booking.estimated_duration_hours,
        bookingId,
      );
      if (availabilityError) {
        await connection.rollback();
        return res.status(409).json({ message: availabilityError });
      }

      await connection.execute(
        'UPDATE bookings SET requested_at = ? WHERE id = ?',
        [requestedAt, bookingId],
      );
      await connection.execute(
        `INSERT INTO booking_schedule_history (
            booking_id, previous_requested_at, requested_at, changed_by, reason
         ) VALUES (?, ?, ?, ?, ?)`,
        [bookingId, booking.requested_at, requestedAt, req.user.id, reason],
      );
      const notification = {
        type: 'booking_rescheduled',
        title: 'Booking rescheduled',
        message: `Booking #${bookingId} was rescheduled to ${requestedAt}.`,
      };
      await createNotificationForUser(connection, Number(booking.provider_user_id), {
        ...notification,
        entityType: 'booking',
        entityId: bookingId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(booking.provider_user_id), notification);
      return res.status(200).json({ message: 'Booking rescheduled.', requestedAt });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.patch(
  '/:bookingId/status',
  authorizeRole('customer'),
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const bookingId = Number(req.params.bookingId);
    const status = req.body?.status;
    const reason = sanitizeText(req.body?.reason, 1000);
    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId < 1 ||
      status !== 'cancelled' ||
      !reason ||
      reason.length < 3
    ) {
      return res.status(400).json({
        message: 'Provide a valid booking ID and a cancellation reason of at least 3 characters.',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[booking]] = await connection.execute(
        `SELECT b.id, b.status, b.booking_reference,
                b.created_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${BOOKING_REQUEST_EXPIRY_HOURS} HOUR) AS request_expired,
                pp.user_id AS provider_user_id
           FROM bookings b
           JOIN provider_profiles pp ON pp.id = b.provider_id
          WHERE b.id = ? AND b.customer_id = ?
          FOR UPDATE`,
        [bookingId, req.user.id],
      );
      if (!booking) {
        await connection.rollback();
        return res.status(404).json({ message: 'Booking was not found.' });
      }
      if (
        ['requested', 'confirmed'].includes(booking.status) &&
        Boolean(booking.request_expired)
      ) {
        await connection.rollback();
        await expireOverdueBookingRequests(getPool());
        return res.status(409).json({ message: 'This booking request has expired.' });
      }
      if (!['requested', 'confirmed', 'accepted'].includes(booking.status)) {
        await connection.rollback();
        return res.status(409).json({ message: 'This booking can no longer be cancelled.' });
      }
      await connection.execute(
        'UPDATE bookings SET status = ? WHERE id = ?',
        [status, bookingId],
      );
      await connection.execute(
        `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by, note)
         VALUES (?, ?, ?, ?, ?)`,
        [bookingId, booking.status, status, req.user.id, reason],
      );
      const notification = {
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: `Booking ${booking.booking_reference} was cancelled by the customer.`,
      };
      await createNotificationForUser(connection, Number(booking.provider_user_id), {
        ...notification,
        entityType: 'booking',
        entityId: bookingId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(booking.provider_user_id), notification);
      return res.status(200).json({ message: 'Booking cancelled.', status });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

export default router;
