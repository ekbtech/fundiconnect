import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import { readVerificationDocument } from '../uploads/verification-documents.js';
import {
  createNotificationForUser,
  emailNotificationForUser,
} from './notifications.js';

const router = Router();
const verificationStates = new Set(['approved', 'rejected']);
const complaintStatuses = new Set(['open', 'investigating', 'resolved', 'closed']);
const categorySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidComplaintStatusTransition(currentStatus, nextStatus) {
  const transitions = {
    open: new Set(['investigating', 'resolved', 'closed']),
    investigating: new Set(['resolved', 'closed']),
    resolved: new Set(['investigating', 'closed']),
    closed: new Set(),
  };
  return Boolean(transitions[currentStatus]?.has(nextStatus));
}

export function isValidAccountStatusChange(currentStatus, nextStatus, reason) {
  return (
    ['active', 'suspended'].includes(currentStatus) &&
    ['active', 'suspended'].includes(nextStatus) &&
    currentStatus !== nextStatus &&
    typeof reason === 'string' &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 1000
  );
}

export function parseCategory(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const category = {};
  if (!partial || Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 150) {
      return null;
    }
    category.name = body.name.trim();
  }
  if (!partial || Object.hasOwn(body, 'slug')) {
    if (typeof body.slug !== 'string' || !categorySlugPattern.test(body.slug.trim()) || body.slug.trim().length > 150) {
      return null;
    }
    category.slug = body.slug.trim();
  }
  if (Object.hasOwn(body, 'description')) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) {
      return null;
    }
    category.description = typeof body.description === 'string' ? body.description.trim() || null : null;
  } else if (!partial) {
    category.description = null;
  }
  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') {
      return null;
    }
    category.isActive = body.isActive;
  }
  if (Object.keys(category).length === 0) {
    return null;
  }
  return category;
}

async function readFinancialSummary(pool) {
  const [[bookings]] = await pool.execute(
    `SELECT COALESCE(SUM(
              CASE WHEN status IN ('confirmed', 'accepted', 'in_progress', 'completed', 'closed')
                   THEN COALESCE(agreed_price, 0) ELSE 0 END
            ), 0) AS gross_booking_value
       FROM bookings`,
  );
  const [[payments]] = await pool.execute(
    `SELECT COALESCE(SUM(status = 'successful'), 0) AS successful_count,
            COALESCE(SUM(CASE WHEN status = 'successful' THEN amount ELSE 0 END), 0) AS collected_amount,
            COALESCE(SUM(status = 'refunded'), 0) AS recorded_refund_count,
            COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) AS recorded_refund_amount
       FROM payments`,
  );
  return {
    currency: 'KES',
    grossBookingValue: Number(bookings.gross_booking_value || 0),
    successfulPaymentCount: Number(payments.successful_count || 0),
    collectedPayments: Number(payments.collected_amount || 0),
    recordedRefundCount: Number(payments.recorded_refund_count || 0),
    recordedRefundAmount: Number(payments.recorded_refund_amount || 0),
    platformRevenue: null,
    platformRevenueStatus: 'not_configured',
  };
}

router.use(authenticate, authorizeRole('admin'));

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const [[users]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(role = 'customer') AS customers,
              SUM(role = 'fundi') AS fundis
         FROM users`,
    );
    const [[providers]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(verification_status = 'pending') AS pending
         FROM provider_profiles`,
    );
    const [[bookings]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'cancelled') AS cancelled,
              SUM(status IN ('completed', 'closed')) AS completed
         FROM bookings`,
    );
    const financialSummary = await readFinancialSummary(pool);
    const [[complaints]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(status IN ('open', 'investigating')) AS unresolved
         FROM complaints`,
    );

    return res.status(200).json({
      stats: {
        totalUsers: Number(users.total),
        customers: Number(users.customers || 0),
        fundis: Number(users.fundis || 0),
        totalProviders: Number(providers.total),
        pendingVerifications: Number(providers.pending || 0),
        totalBookings: Number(bookings.total),
        cancelledBookings: Number(bookings.cancelled || 0),
        completedBookings: Number(bookings.completed || 0),
        successfulPayments: financialSummary.successfulPaymentCount,
        collectedAmount: financialSummary.collectedPayments,
        grossBookingValue: financialSummary.grossBookingValue,
        recordedRefundAmount: financialSummary.recordedRefundAmount,
        totalComplaints: Number(complaints.total),
        unresolvedComplaints: Number(complaints.unresolved || 0),
      },
    });
  }),
);

router.get(
  '/reports/financial',
  asyncHandler(async (req, res) => {
    return res.status(200).json({ financialSummary: await readFinancialSummary(getPool()) });
  }),
);

router.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const status = req.query.status === undefined ? 'open' : req.query.status;
    if (status !== 'all' && !complaintStatuses.has(status)) {
      return res.status(400).json({ message: 'Provide a valid complaint status filter.' });
    }
    const statusFilter = status === 'all' ? '' : 'WHERE c.status = ?';
    const params = status === 'all' ? [] : [status];
    const [rows] = await getPool().execute(
      `SELECT c.id, c.booking_id, c.reporter_id, c.against_user_id,
              c.subject, c.description, c.status, c.created_at, c.updated_at,
              b.booking_reference,
              reporter.first_name AS reporter_first_name,
              reporter.last_name AS reporter_last_name,
              against.first_name AS against_first_name,
              against.last_name AS against_last_name
         FROM complaints c
         JOIN bookings b ON b.id = c.booking_id
         JOIN users reporter ON reporter.id = c.reporter_id
         JOIN users against ON against.id = c.against_user_id
         ${statusFilter}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 100`,
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
        updatedAt: complaint.updated_at,
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

router.patch(
  '/complaints/:complaintId/status',
  asyncHandler(async (req, res) => {
    const complaintId = Number(req.params.complaintId);
    const status = req.body?.status;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (
      !Number.isSafeInteger(complaintId) ||
      complaintId < 1 ||
      !complaintStatuses.has(status) ||
      reason.length < 3 ||
      reason.length > 1000
    ) {
      return res.status(400).json({
        message: 'Provide a valid complaint status and a moderation reason of 3 to 1000 characters.',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, reporter_id, subject, status
           FROM complaints WHERE id = ? FOR UPDATE`,
        [complaintId],
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Complaint was not found.' });
      }

      const complaint = rows[0];
      if (!isValidComplaintStatusTransition(complaint.status, status)) {
        await connection.rollback();
        return res.status(409).json({
          message: `Complaint status cannot change from ${complaint.status} to ${status}.`,
        });
      }

      await connection.execute(
        'UPDATE complaints SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, complaintId],
      );
      await connection.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'complaint', ?, ?)`,
        [
          req.user.id,
          `complaint_status_${status}`,
          complaintId,
          JSON.stringify({ previousStatus: complaint.status, status, reason }),
        ],
      );
      const notification = {
        type: 'complaint_status_updated',
        title: 'Complaint status updated',
        message: `Your complaint "${complaint.subject}" is now ${status}.`,
      };
      await createNotificationForUser(connection, Number(complaint.reporter_id), {
        ...notification,
        entityType: 'complaint',
        entityId: complaintId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(complaint.reporter_id), notification);
      return res.status(200).json({ message: 'Complaint status updated.', status });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const [rows] = await getPool().execute(
      `SELECT id, name, slug, description, is_active, created_at
         FROM service_categories
        ORDER BY name ASC, id ASC`,
    );
    return res.status(200).json({
      categories: rows.map((category) => ({
        id: String(category.id),
        name: category.name,
        slug: category.slug,
        description: category.description,
        isActive: Boolean(category.is_active),
        createdAt: category.created_at,
      })),
    });
  }),
);

router.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const category = parseCategory(req.body);
    if (!category || category.isActive !== undefined) {
      return res.status(400).json({ message: 'Provide a valid category name, slug, and optional description.' });
    }
    try {
      const [result] = await getPool().execute(
        `INSERT INTO service_categories (name, slug, description)
         VALUES (?, ?, ?)`,
        [category.name, category.slug, category.description],
      );
      return res.status(201).json({
        message: 'Service category created.',
        category: { id: String(result.insertId), ...category, isActive: true },
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'A service category with this slug already exists.' });
      }
      throw error;
    }
  }),
);

router.patch(
  '/categories/:categoryId',
  asyncHandler(async (req, res) => {
    const categoryId = Number(req.params.categoryId);
    const category = parseCategory(req.body, true);
    if (!Number.isSafeInteger(categoryId) || categoryId < 1 || !category) {
      return res.status(400).json({ message: 'Provide a valid category ID and at least one valid category field.' });
    }
    const fields = {
      name: 'name',
      slug: 'slug',
      description: 'description',
      isActive: 'is_active',
    };
    const assignments = Object.keys(category).map((field) => `${fields[field]} = ?`);
    const values = Object.values(category);
    try {
      const [existing] = await getPool().execute(
        'SELECT id FROM service_categories WHERE id = ? LIMIT 1',
        [categoryId],
      );
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Service category was not found.' });
      }
      await getPool().execute(
        `UPDATE service_categories
            SET ${assignments.join(', ')}
          WHERE id = ?`,
        [...values, categoryId],
      );
      return res.status(200).json({ message: 'Service category updated.' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'A service category with this slug already exists.' });
      }
      throw error;
    }
  }),
);

router.get(
  '/providers',
  asyncHandler(async (req, res) => {
    const status = req.query.status === undefined ? 'pending' : req.query.status;
    if (!['pending', 'approved', 'rejected', 'resubmitted', 'all'].includes(status)) {
      return res.status(400).json({ message: 'Provide a valid verification status filter.' });
    }
    const values = status === 'all' ? [] : [status];
    const statusFilter = status === 'all' ? '' : 'WHERE pp.verification_status = ?';
    const pool = getPool();
    const [providers] = await pool.execute(
      `SELECT pp.id, pp.business_name, pp.bio, pp.experience_years,
              pp.verification_status, pp.is_verified, pp.created_at,
              u.id AS user_id, u.first_name, u.last_name, u.email
         FROM provider_profiles pp
         JOIN users u ON u.id = pp.user_id
        ${statusFilter}
        ORDER BY pp.created_at ASC, pp.id ASC
        LIMIT 100`,
      values,
    );
    const documentsByProvider = new Map(
      providers.map((provider) => [String(provider.id), []]),
    );
    if (providers.length > 0) {
      const placeholders = providers.map(() => '?').join(', ');
      const [documents] = await pool.execute(
        `SELECT id, provider_id, document_type, original_filename, mime_type,
                size_bytes, uploaded_at
           FROM provider_verification_documents
          WHERE provider_id IN (${placeholders})
          ORDER BY uploaded_at DESC, id DESC`,
        providers.map((provider) => provider.id),
      );
      for (const document of documents) {
        documentsByProvider.get(String(document.provider_id)).push({
          id: String(document.id),
          documentType: document.document_type,
          originalFilename: document.original_filename,
          mimeType: document.mime_type,
          sizeBytes: Number(document.size_bytes),
          uploadedAt: document.uploaded_at,
        });
      }
    }
    return res.status(200).json({
      providers: providers.map((provider) => ({
        id: String(provider.id),
        businessName: provider.business_name,
        bio: provider.bio,
        experienceYears: provider.experience_years,
        verificationStatus: provider.verification_status,
        isVerified: Boolean(provider.is_verified),
        createdAt: provider.created_at,
        user: {
          id: String(provider.user_id),
          firstName: provider.first_name,
          lastName: provider.last_name,
          email: provider.email,
        },
        verificationDocuments: documentsByProvider.get(String(provider.id)),
      })),
    });
  }),
);

router.get(
  '/verification-documents/:documentId/file',
  asyncHandler(async (req, res) => {
    const documentId = Number(req.params.documentId);
    if (!Number.isSafeInteger(documentId) || documentId < 1) {
      return res.status(400).json({ message: 'Provide a valid verification document ID.' });
    }
    const [[document]] = await getPool().execute(
      `SELECT storage_key, file_extension
         FROM provider_verification_documents
        WHERE id = ?
        LIMIT 1`,
      [documentId],
    );
    if (!document) {
      return res.status(404).json({ message: 'Verification document was not found.' });
    }
    const contents = await readVerificationDocument(document.storage_key, document.file_extension);
    if (!contents) {
      return res.status(404).json({ message: 'Verification document file was not found.' });
    }
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="verification-document-${documentId}.${document.file_extension}"`,
      'Content-Length': contents.length,
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(contents);
  }),
);

router.patch(
  '/providers/:providerId/verification',
  asyncHandler(async (req, res) => {
    const providerId = Number(req.params.providerId);
    const { status, reason } = req.body || {};
    if (
      !Number.isSafeInteger(providerId) ||
      providerId < 1 ||
      !verificationStates.has(status) ||
      (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000)) ||
      (status === 'rejected' && (!reason || !reason.trim()))
    ) {
      return res.status(400).json({
        message: 'Choose approved or rejected and provide a reason when rejecting verification.',
      });
    }
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [providers] = await connection.execute(
        `SELECT id, user_id, verification_status
           FROM provider_profiles WHERE id = ? FOR UPDATE`,
        [providerId],
      );
      if (providers.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Provider profile was not found.' });
      }
      const previousStatus = providers[0].verification_status;
      if (!['pending', 'resubmitted'].includes(previousStatus)) {
        await connection.rollback();
        return res.status(409).json({ message: 'Only pending provider verifications can be reviewed.' });
      }
      await connection.execute(
        `UPDATE provider_profiles
            SET verification_status = ?, is_verified = ?
          WHERE id = ?`,
        [status, status === 'approved', providerId],
      );
      await connection.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'provider_profile', ?, ?)`,
        [
          req.user.id,
          `provider_verification_${status}`,
          providerId,
          JSON.stringify({ previousStatus, status, reason: reason?.trim() || null }),
        ],
      );
      const notification = {
        type: `provider_verification_${status}`,
        title: status === 'approved' ? 'Provider profile approved' : 'Provider profile needs changes',
        message: status === 'approved'
          ? 'Your FundiConnect provider profile has been approved.'
          : `Your provider profile was not approved. Administrator feedback: ${reason.trim()}`,
      };
      await createNotificationForUser(connection, Number(providers[0].user_id), notification);
      await connection.commit();
      await emailNotificationForUser(Number(providers[0].user_id), notification);
      return res.status(200).json({
        message: `Provider verification ${status}.`,
        verificationStatus: status,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const role = req.query.role;
    if (role !== undefined && !['customer', 'fundi', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Provide a valid user role filter.' });
    }
    const values = role ? [role] : [];
    const roleFilter = role ? 'WHERE u.role = ?' : '';
    const [users] = await getPool().execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
              u.account_status, u.email_verified_at, u.created_at
         FROM users u
        ${roleFilter}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT 100`,
      values,
    );
    return res.status(200).json({
      users: users.map((user) => ({
        id: String(user.id),
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at,
      })),
    });
  }),
);

router.patch(
  '/users/:userId/status',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const status = req.body?.status;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (
      !Number.isSafeInteger(userId) ||
      userId < 1 ||
      !['active', 'suspended'].includes(status) ||
      reason.length < 3 ||
      reason.length > 1000
    ) {
      return res.status(400).json({
        message: 'Provide a valid account status and a reason of 3 to 1000 characters.',
      });
    }
    if (Number(req.user.id) === userId) {
      return res.status(400).json({ message: 'Administrators cannot change their own account status.' });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute(
        'SELECT id, role, account_status FROM users WHERE id = ? FOR UPDATE',
        [userId],
      );
      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Account was not found.' });
      }
      const account = users[0];
      if (account.role === 'admin') {
        await connection.rollback();
        return res.status(403).json({ message: 'Administrator accounts cannot be suspended through this control.' });
      }
      if (!isValidAccountStatusChange(account.account_status, status, reason)) {
        await connection.rollback();
        return res.status(409).json({
          message: account.account_status === status
            ? `This account is already ${status}.`
            : 'The account status cannot be changed from its current state.',
        });
      }

      await connection.execute(
        'UPDATE users SET account_status = ? WHERE id = ?',
        [status, userId],
      );
      if (status === 'suspended') {
        await connection.execute(
          `UPDATE user_sessions
              SET revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND revoked_at IS NULL`,
          [userId],
        );
      }
      await connection.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, ?, 'user', ?, ?)`,
        [
          req.user.id,
          `account_${status}`,
          userId,
          JSON.stringify({ previousStatus: account.account_status, status, reason }),
        ],
      );
      await connection.commit();
      return res.status(200).json({ message: `Account ${status}.`, accountStatus: status });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const [logs] = await getPool().execute(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
              u.first_name, u.last_name, u.email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 100`,
    );
    return res.status(200).json({
      logs: logs.map((log) => ({
        id: String(log.id),
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id === null ? null : String(log.entity_id),
        details: log.details,
        createdAt: log.created_at,
        actor: log.email
          ? { firstName: log.first_name, lastName: log.last_name, email: log.email }
          : null,
      })),
    });
  }),
);

export default router;
