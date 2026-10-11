import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import { createNotificationForUser, emailNotificationForUser } from './notifications.js';

const router = Router();
const complaintStatuses = new Set(['open', 'investigating', 'resolved', 'closed']);

export function normalizeReviewRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return Math.round(parsed * 10) / 10;
}

export function normalizeReviewComment(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  if (text.length === 0 || text.length > 2000) {
    return null;
  }

  return text;
}

export function normalizeComplaintStatus(value) {
  if (value === undefined) {
    return 'open';
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return complaintStatuses.has(normalized) ? normalized : null;
}

router.use(authenticate);

router.get(
  '/providers/:providerId',
  asyncHandler(async (req, res) => {
    const providerId = Number(req.params.providerId);
    if (!Number.isSafeInteger(providerId) || providerId < 1) {
      return res.status(400).json({ message: 'Provide a valid provider ID.' });
    }

    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              reviewer.first_name AS reviewer_first_name,
              reviewer.last_name AS reviewer_last_name
         FROM reviews r
         JOIN users reviewer ON reviewer.id = r.reviewer_id
        WHERE r.provider_id = ?
        ORDER BY r.created_at DESC, r.id DESC`,
      [providerId],
    );
    const [[summary]] = await pool.execute(
      `SELECT AVG(rating) AS average_rating, COUNT(*) AS total_reviews
         FROM reviews
        WHERE provider_id = ?`,
      [providerId],
    );

    return res.status(200).json({
      providerId: String(providerId),
      averageRating: summary.average_rating === null ? 0 : Number(summary.average_rating),
      totalReviews: Number(summary.total_reviews || 0),
      reviews: rows.map((review) => ({
        id: String(review.id),
        rating: Number(review.rating),
        comment: review.comment,
        createdAt: review.created_at,
        reviewer: {
          firstName: review.reviewer_first_name,
          lastName: review.reviewer_last_name,
        },
      })),
    });
  }),
);

router.post(
  '/',
  authorizeRole('customer'),
  asyncHandler(async (req, res) => {
    const bookingId = Number(req.body?.bookingId);
    const rating = normalizeReviewRating(req.body?.rating);
    const comment = normalizeReviewComment(req.body?.comment);

    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId < 1 ||
      rating === null ||
      comment === null
    ) {
      return res.status(400).json({
        message: 'Provide a valid bookingId and rating from 1 to 5. A comment is optional.',
      });
    }

    const pool = getPool();
    const [bookings] = await pool.execute(
      `SELECT b.id, b.customer_id, b.provider_id, pp.user_id AS provider_user_id
         FROM bookings b
         JOIN provider_profiles pp ON pp.id = b.provider_id
        WHERE b.id = ? AND b.status = 'closed' LIMIT 1`,
      [bookingId],
    );

    if (bookings.length === 0) {
      return res.status(404).json({ message: 'Only completed bookings can receive reviews.' });
    }

    const booking = bookings[0];
    if (Number(booking.customer_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You can only review your own completed bookings.' });
    }

    const [existing] = await pool.execute(
      `SELECT id FROM reviews WHERE booking_id = ? LIMIT 1`,
      [bookingId],
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'This booking has already been reviewed.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO reviews (booking_id, reviewer_id, provider_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [bookingId, req.user.id, booking.provider_id, rating, comment],
    );

    await pool.execute(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'review', ?, ?)`,
      [
        req.user.id,
        'review_submitted',
        result.insertId,
        JSON.stringify({ bookingId, rating, comment }),
      ],
    );

    await createNotificationForUser(pool, Number(booking.provider_user_id), {
      type: 'review_received',
      title: 'New review received',
      message: `You received a ${rating}-star review on booking #${bookingId}.`,
      entityType: 'review',
      entityId: result.insertId,
    });
    await emailNotificationForUser(Number(booking.provider_user_id), {
      type: 'review_received',
      title: 'New review received',
      message: `You received a ${rating}-star review on booking #${bookingId}.`,
    });

    return res.status(201).json({
      message: 'Review submitted successfully.',
      review: {
        id: String(result.insertId),
        bookingId: String(bookingId),
        providerId: String(booking.provider_id),
        rating,
        comment,
      },
    });
  }),
);

router.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    let whereClause = '';
    const params = [];

    if (req.user.role === 'customer') {
      whereClause = 'WHERE c.reporter_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'fundi') {
      whereClause = 'WHERE c.against_user_id = ?';
      params.push(req.user.id);
    }

    const [rows] = await pool.execute(
      `SELECT c.id, c.booking_id, c.reporter_id, c.against_user_id, c.subject, c.description,
              c.status, c.created_at,
              booking.booking_reference,
              reporter.first_name AS reporter_first_name,
              reporter.last_name AS reporter_last_name,
              against.first_name AS against_first_name,
              against.last_name AS against_last_name
         FROM complaints c
         JOIN bookings booking ON booking.id = c.booking_id
         JOIN users reporter ON reporter.id = c.reporter_id
         JOIN users against ON against.id = c.against_user_id
         ${whereClause}
         ORDER BY c.created_at DESC, c.id DESC`,
      params,
    );

    return res.status(200).json({
      complaints: rows.map((complaint) => ({
        id: String(complaint.id),
        bookingId: String(complaint.booking_id),
        bookingReference: complaint.booking_reference,
        subject: complaint.subject,
        description: complaint.description,
        status: complaint.status,
        createdAt: complaint.created_at,
        reporter: {
          id: String(complaint.reporter_id),
          firstName: complaint.reporter_first_name,
          lastName: complaint.reporter_last_name,
        },
        against: {
          id: String(complaint.against_user_id),
          firstName: complaint.against_first_name,
          lastName: complaint.against_last_name,
        },
      })),
    });
  }),
);

router.post(
  '/complaints',
  asyncHandler(async (req, res) => {
    const bookingId = Number(req.body?.bookingId);
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const requestedStatus = req.body?.status === undefined
      ? 'open'
      : normalizeComplaintStatus(req.body.status);

    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId < 1 ||
      subject.length < 3 ||
      subject.length > 200 ||
      description.length < 10 ||
      description.length > 5000 ||
      requestedStatus !== 'open'
    ) {
      return res.status(400).json({
        message: 'Provide a valid bookingId, subject, and description. New complaints start as open.',
      });
    }

    const pool = getPool();
    const [bookings] = await pool.execute(
      `SELECT b.id, b.customer_id, b.provider_id,
              customer_user.id AS customer_user_id,
              provider_user.id AS provider_user_id
         FROM bookings b
         JOIN provider_profiles pp ON pp.id = b.provider_id
         JOIN users customer_user ON customer_user.id = b.customer_id
         JOIN users provider_user ON provider_user.id = pp.user_id
        WHERE b.id = ? LIMIT 1`,
      [bookingId],
    );

    if (bookings.length === 0) {
      return res.status(404).json({ message: 'Booking was not found.' });
    }

    const booking = bookings[0];
    const isCustomer = Number(booking.customer_user_id) === Number(req.user.id);
    const isProvider = Number(booking.provider_user_id) === Number(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ message: 'You can only file complaints for your own booking activity.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO complaints (booking_id, reporter_id, against_user_id, subject, description, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        req.user.id,
        isCustomer ? booking.provider_user_id : booking.customer_user_id,
        subject,
        description,
        'open',
      ],
    );

    const targetUser = isCustomer ? Number(booking.provider_user_id) : Number(booking.customer_user_id);
    await createNotificationForUser(pool, targetUser, {
      type: 'complaint_submitted',
      title: 'New complaint submitted',
      message: `A complaint was filed for booking #${bookingId}: ${subject}.`,
      entityType: 'complaint',
      entityId: result.insertId,
    });
    await emailNotificationForUser(targetUser, {
      type: 'complaint_submitted',
      title: 'New complaint submitted',
      message: `A complaint was filed for booking #${bookingId}: ${subject}.`,
    });

    return res.status(201).json({
      message: 'Complaint submitted successfully.',
      complaint: {
        id: String(result.insertId),
        bookingId: String(bookingId),
        subject,
        description,
        status: 'open',
      },
    });
  }),
);

export default router;
