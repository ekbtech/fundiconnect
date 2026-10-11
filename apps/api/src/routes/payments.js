import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import { createNotificationForUser, emailNotificationForUser } from './notifications.js';

const router = Router();
const paymentMethods = new Set(['cash', 'mobile_money', 'card', 'bank_transfer']);
const paymentStatuses = new Set(['pending', 'successful', 'failed', 'cancelled', 'refunded']);

export function normalizePaymentStatus(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return paymentStatuses.has(normalized) ? normalized : null;
}

export function normalizePaymentMethod(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return paymentMethods.has(normalized) ? normalized : null;
}

export function normalizePaymentAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999999) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

export function normalizeCurrency(value) {
  if (value === undefined) {
    return 'KES';
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function isValidPaymentTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  const transitions = {
    pending: new Set(['successful', 'failed', 'cancelled']),
    successful: new Set(['refunded']),
    failed: new Set([]),
    cancelled: new Set([]),
    refunded: new Set([]),
  };

  return Boolean(transitions[currentStatus] && transitions[currentStatus].has(nextStatus));
}

export function canManuallyUpdatePaymentStatus(role, currentStatus, nextStatus, reason) {
  return (
    role === 'admin' &&
    typeof reason === 'string' &&
    reason.trim().length > 0 &&
    reason.trim().length <= 1000 &&
    isValidPaymentTransition(currentStatus, nextStatus)
  );
}

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

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const params = [];
    let whereClause = '';

    if (req.user.role === 'customer') {
      whereClause = 'WHERE p.payer_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'fundi') {
      whereClause = 'WHERE p.payee_id = ?';
      params.push(req.user.id);
    }

    const [rows] = await pool.execute(
      `SELECT p.id, p.booking_id, p.payer_id, p.payee_id,
              p.payment_method, p.amount, p.currency, p.status,
              p.transaction_reference, p.created_at, p.updated_at,
              b.booking_reference, b.agreed_price,
              payer.first_name AS payer_first_name,
              payer.last_name AS payer_last_name,
              payee.first_name AS payee_first_name,
              payee.last_name AS payee_last_name
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         JOIN users payer ON payer.id = p.payer_id
         JOIN users payee ON payee.id = p.payee_id
         ${whereClause}
         ORDER BY p.created_at DESC, p.id DESC`,
      params,
    );

    return res.status(200).json({
      payments: rows.map((payment) => ({
        id: String(payment.id),
        bookingId: String(payment.booking_id),
        bookingReference: payment.booking_reference,
        payer: {
          id: String(payment.payer_id),
          firstName: payment.payer_first_name,
          lastName: payment.payer_last_name,
        },
        payee: {
          id: String(payment.payee_id),
          firstName: payment.payee_first_name,
          lastName: payment.payee_last_name,
        },
        paymentMethod: payment.payment_method,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        transactionReference: payment.transaction_reference,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
        agreedPrice: payment.agreed_price === null ? null : Number(payment.agreed_price),
      })),
    });
  }),
);

router.post(
  '/',
  authorizeRole('customer', 'admin'),
  asyncHandler(async (req, res) => {
    const bookingId = Number(req.body?.bookingId);
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const amount = normalizePaymentAmount(req.body?.amount);
    const currency = normalizeCurrency(req.body?.currency);
    const requestedStatus = req.body?.status === undefined
      ? 'pending'
      : normalizePaymentStatus(req.body.status);
    const transactionReference = sanitizeText(req.body?.transactionReference, 150, 'transactionReference');

    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId < 1 ||
      !paymentMethod ||
      amount === null ||
      amount <= 0 ||
      !currency ||
      requestedStatus !== 'pending'
    ) {
      return res.status(400).json({
        message: 'Provide a valid bookingId, paymentMethod, amount, and optional transactionReference. New payments must start as pending.',
      });
    }

    const pool = getPool();
    const [bookings] = await pool.execute(
      `SELECT b.id, b.customer_id, b.provider_id, b.agreed_price, b.status,
              pp.user_id AS payee_user_id
         FROM bookings b
         JOIN provider_profiles pp ON pp.id = b.provider_id
        WHERE b.id = ? LIMIT 1`,
      [bookingId],
    );

    if (bookings.length === 0) {
      return res.status(404).json({ message: 'Booking was not found.' });
    }

    const booking = bookings[0];
    if (req.user.role === 'customer' && Number(booking.customer_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You can only create payments for your own bookings.' });
    }

    const effectiveAmount = amount ?? Number(booking.agreed_price || 0);
    if (effectiveAmount <= 0) {
      return res.status(400).json({ message: 'The payment amount must be greater than zero.' });
    }

    if (transactionReference) {
      const [existing] = await pool.execute(
        `SELECT id FROM payments WHERE booking_id = ? AND transaction_reference = ? LIMIT 1`,
        [bookingId, transactionReference],
      );

      if (existing.length > 0) {
        return res.status(409).json({ message: 'A payment with this transaction reference already exists for this booking.' });
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO payments (
          booking_id, payer_id, payee_id, payment_method, amount, currency, status, transaction_reference
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        req.user.role === 'admin' ? booking.customer_id : req.user.id,
        booking.payee_user_id,
        paymentMethod,
        effectiveAmount,
        currency,
        'pending',
        transactionReference || null,
      ],
    );

    const paymentId = result.insertId;
    await pool.execute(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'payment', ?, ?)`,
      [
        req.user.id,
        'payment_recorded',
        paymentId,
        JSON.stringify({
          bookingId,
          amount: effectiveAmount,
          currency,
          paymentMethod,
          status: 'pending',
          transactionReference: transactionReference || null,
        }),
      ],
    );

    const [rows] = await pool.execute(
      `SELECT p.id, p.booking_id, p.payer_id, p.payee_id,
              p.payment_method, p.amount, p.currency, p.status,
              p.transaction_reference, p.created_at, p.updated_at,
              b.booking_reference
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
        WHERE p.id = ? LIMIT 1`,
      [paymentId],
    );

    const payment = rows[0];
    const notification = {
      type: 'payment_recorded',
      title: 'Payment recorded',
      message: `A ${currency} ${Number(payment.amount).toFixed(2)} payment was recorded for booking ${payment.booking_reference}.`,
    };
    await createNotificationForUser(pool, booking.payee_user_id, {
      ...notification,
      entityType: 'payment',
      entityId: paymentId,
    });
    await emailNotificationForUser(Number(booking.payee_user_id), notification);

    return res.status(201).json({
      message: 'Payment record created successfully.',
      payment: {
        id: String(payment.id),
        bookingId: String(payment.booking_id),
        bookingReference: payment.booking_reference,
        payerId: String(payment.payer_id),
        payeeId: String(payment.payee_id),
        paymentMethod: payment.payment_method,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        transactionReference: payment.transaction_reference,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      },
    });
  }),
);

router.patch(
  '/:paymentId/status',
  authorizeRole('admin'),
  asyncHandler(async (req, res) => {
    const paymentId = Number(req.params.paymentId);
    const status = normalizePaymentStatus(req.body?.status);
    const reason = sanitizeText(req.body?.reason, 1000, 'reason');

    if (
      !Number.isSafeInteger(paymentId) ||
      paymentId < 1 ||
      !status ||
      !paymentStatuses.has(status) ||
      !reason
    ) {
      return res.status(400).json({
        message: 'Provide a valid payment status and a reason for the administrator action.',
      });
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT id, status, payer_id, payee_id FROM payments WHERE id = ? FOR UPDATE',
        [paymentId],
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Payment record was not found.' });
      }

      const payment = rows[0];
      if (!canManuallyUpdatePaymentStatus(req.user.role, payment.status, status, reason)) {
        await connection.rollback();
        return res.status(409).json({
          message: `Payment status cannot change from ${payment.status} to ${status}.`,
        });
      }

      await connection.execute(
        `UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, paymentId],
      );

      await connection.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'payment', ?, ?)`,
        [
          req.user.id,
          `payment_status_${status}`,
          paymentId,
          JSON.stringify({ previousStatus: payment.status, updatedStatus: status, reason }),
        ],
      );
      const notification = {
        type: `payment_${status}`,
        title: 'Payment status updated',
        message: `An administrator updated your payment record to ${status}. Reason: ${reason}`,
      };
      await createNotificationForUser(connection, Number(payment.payer_id), {
        ...notification,
        entityType: 'payment',
        entityId: paymentId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(payment.payer_id), notification);

      return res.status(200).json({
        message: 'Payment status updated successfully.',
        payment: {
          id: String(paymentId),
          status,
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

export default router;
