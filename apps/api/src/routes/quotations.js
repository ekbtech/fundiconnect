import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { normalizeAppointment, validateProviderAppointment } from '../bookings/availability.js';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import { createNotificationForUser, emailNotificationForUser } from './notifications.js';
import { photoUpload, readPhoto, removePhoto, storePhoto, validatePhoto } from '../uploads/media.js';

const router = Router();

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000000) {
    return null;
  }

  return parsed;
}

function parsePrice(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999999) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function getRequestOwnershipClause(user) {
  if (user.role === 'customer') {
    return 'WHERE qr.customer_id = ?';
  }

  if (user.role === 'fundi') {
    return 'WHERE qr.provider_id = (SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1)';
  }

  if (user.role === 'admin') {
    return 'WHERE 1 = 1';
  }

  return 'WHERE 1 = 0';
}

function getRequestOwnershipParams(user) {
  if (user.role === 'customer') {
    return [user.id];
  }

  if (user.role === 'fundi') {
    return [user.id];
  }

  return [];
}

function buildRequestSummary(request, quotes, photos = []) {
  return {
    id: String(request.id),
    title: request.title,
    description: request.description,
    photos: photos.map((photo) => ({
      id: String(photo.id),
      mimeType: photo.mime_type,
      sizeBytes: Number(photo.size_bytes),
      url: `/api/v1/quotations/requests/${request.id}/photos/${photo.id}`,
    })),
    status: request.status,
    createdAt: request.created_at,
    service: request.service_id
      ? {
          id: String(request.service_id),
          name: request.service_name,
        }
      : null,
    provider: request.provider_id
      ? {
          id: String(request.provider_id),
          businessName: request.provider_business_name,
          user: request.provider_user_id
            ? {
                id: String(request.provider_user_id),
                firstName: request.provider_first_name,
                lastName: request.provider_last_name,
              }
            : null,
        }
      : null,
    customer: request.customer_id
      ? {
          id: String(request.customer_id),
          firstName: request.customer_first_name,
          lastName: request.customer_last_name,
        }
      : null,
    quotations: Array.isArray(quotes)
      ? quotes.map((quote) => ({
          id: String(quote.id),
          status: quote.status,
          estimatedPrice: quote.estimated_price === null ? null : Number(quote.estimated_price),
          scopeOfWork: quote.scope_of_work,
          exclusions: quote.exclusions,
          validityDays: quote.validity_days,
          proposedSchedule: quote.proposed_schedule,
          createdAt: quote.created_at,
          expiresAt: quote.expires_at,
          provider: quote.provider_id
            ? {
                id: String(quote.provider_id),
                businessName: quote.provider_business_name,
              }
            : null,
        }))
      : [],
  };
}

const listRequestsHandler = asyncHandler(async (req, res) => {
  const pool = getPool();
  const whereClause = getRequestOwnershipClause(req.user);
  const params = getRequestOwnershipParams(req.user);

  const [rows] = await pool.execute(
    `SELECT qr.id, qr.title, qr.description, qr.status, qr.created_at,
            qr.customer_id, qr.provider_id, qr.service_id,
            s.name AS service_name,
            pp.business_name AS provider_business_name,
            provider_user.id AS provider_user_id,
            provider_user.first_name AS provider_first_name,
            provider_user.last_name AS provider_last_name,
            customer_user.id AS customer_user_id,
            customer_user.first_name AS customer_first_name,
            customer_user.last_name AS customer_last_name
       FROM quotation_requests qr
       JOIN services s ON s.id = qr.service_id
       JOIN provider_profiles pp ON pp.id = qr.provider_id
       JOIN users provider_user ON provider_user.id = pp.user_id
       JOIN users customer_user ON customer_user.id = qr.customer_id
       ${whereClause}
       ORDER BY qr.created_at DESC, qr.id DESC`,
    params,
  );

  const quotesByRequest = new Map();
  const photosByRequest = new Map();
  if (rows.length > 0) {
    const placeholders = rows.map(() => '?').join(', ');
    const [quoteRows, photoRows] = await Promise.all([
      pool.execute(
      `SELECT q.id, q.request_id, q.status, q.estimated_price,
              q.scope_of_work, q.exclusions, q.validity_days,
              q.proposed_schedule, q.created_at,
              DATE_ADD(q.created_at, INTERVAL q.validity_days DAY) AS expires_at,
              pp.id AS provider_id, pp.business_name AS provider_business_name
         FROM quotations q
         JOIN provider_profiles pp ON pp.id = q.provider_id
        WHERE q.request_id IN (${placeholders})
        ORDER BY q.created_at DESC, q.id DESC`,
      rows.map((request) => request.id),
      ),
      pool.execute(
        `SELECT id, request_id, mime_type, size_bytes
           FROM quotation_request_photos
          WHERE request_id IN (${placeholders})
          ORDER BY uploaded_at, id`,
        rows.map((request) => request.id),
      ),
    ]);
    for (const quote of quoteRows[0]) {
      const requestQuotes = quotesByRequest.get(quote.request_id) || [];
      requestQuotes.push(quote);
      quotesByRequest.set(quote.request_id, requestQuotes);
    }
    for (const photo of photoRows[0]) {
      const requestPhotos = photosByRequest.get(photo.request_id) || [];
      requestPhotos.push(photo);
      photosByRequest.set(photo.request_id, requestPhotos);
    }
  }

  return res.status(200).json({
    requests: rows.map((request) =>
      buildRequestSummary(
        request,
        quotesByRequest.get(request.id) || [],
        photosByRequest.get(request.id) || [],
      ),
    ),
  });
});

const createRequestHandler = asyncHandler(async (req, res) => {
  const title = sanitizeText(req.body?.title, 200);
  const description = sanitizeText(req.body?.description, 5000);
  const serviceId = parsePositiveInteger(req.body?.serviceId, 'serviceId');

  if (!title || !description || !serviceId) {
    return res.status(400).json({
      message: 'Provide a valid title, description, and serviceId.',
    });
  }

  const pool = getPool();
  const [[service]] = await pool.execute(
    `SELECT s.id, s.provider_id, s.is_active, pp.user_id AS provider_user_id, pp.verification_status, pp.is_verified
       FROM services s
       JOIN provider_profiles pp ON pp.id = s.provider_id
      WHERE s.id = ? LIMIT 1`,
    [serviceId],
  );

  if (!service) {
    return res.status(404).json({ message: 'Service was not found.' });
  }

  if (!service.is_active) {
    return res.status(400).json({ message: 'This service is no longer accepting requests.' });
  }

  if (service.provider_user_id === req.user.id) {
    return res.status(400).json({ message: 'You cannot request a quotation for your own service.' });
  }

  if (service.verification_status !== 'approved' || !service.is_verified) {
    return res.status(400).json({ message: 'The provider must be verified before a quotation can be requested.' });
  }

  const photos = (req.files || []).map(validatePhoto);
  if (photos.some((photo) => !photo)) {
    return res.status(400).json({ message: 'Each job photo must be a valid JPEG or PNG no larger than 5 MB.' });
  }

  const connection = await pool.getConnection();
  const storedPaths = [];
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO quotation_requests (customer_id, provider_id, service_id, title, description, status)
       VALUES (?, ?, ?, ?, ?, 'requested')`,
      [req.user.id, service.provider_id, service.id, title, description],
    );
    const requestId = result.insertId;
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const storedPath = await storePhoto(
        'quotation',
        photo.storageKey,
        photo.extension,
        req.files[index].buffer,
      );
      storedPaths.push(storedPath);
      await connection.execute(
        `INSERT INTO quotation_request_photos (request_id, storage_key, file_extension, mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?)`,
        [requestId, photo.storageKey, photo.extension, photo.mimeType, photo.sizeBytes],
      );
    }
    const notification = {
      type: 'quotation_request',
      title: 'New quotation request',
      message: `A customer requested a quotation for "${title}".`,
    };
    await createNotificationForUser(connection, Number(service.provider_user_id), {
      ...notification,
      entityType: 'quotation_request',
      entityId: requestId,
    });
    const [[request]] = await connection.execute(
      `SELECT qr.id, qr.title, qr.description, qr.status, qr.created_at,
              qr.customer_id, qr.provider_id, qr.service_id,
              s.name AS service_name,
              pp.business_name AS provider_business_name,
              customer_user.first_name AS customer_first_name,
              customer_user.last_name AS customer_last_name
         FROM quotation_requests qr
         JOIN services s ON s.id = qr.service_id
         JOIN provider_profiles pp ON pp.id = qr.provider_id
         JOIN users customer_user ON customer_user.id = qr.customer_id
        WHERE qr.id = ? LIMIT 1`,
      [requestId],
    );
    const [requestPhotos] = await connection.execute(
      'SELECT id, mime_type, size_bytes FROM quotation_request_photos WHERE request_id = ? ORDER BY id',
      [requestId],
    );
    await connection.commit();
    await emailNotificationForUser(Number(service.provider_user_id), notification);
    return res.status(201).json({
      message: 'Quotation request created successfully.',
      request: buildRequestSummary(request, [], requestPhotos),
    });
  } catch (error) {
    await connection.rollback();
    for (const storedPath of storedPaths) {
      try {
        await removePhoto(storedPath);
      } catch (cleanupError) {
        console.error('Could not remove an unlinked quotation photo.', cleanupError);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
});

const createQuoteHandler = asyncHandler(async (req, res) => {
  const requestId = parsePositiveInteger(req.params?.requestId ?? req.body?.requestId, 'requestId');
  const estimatedPrice = parsePrice(req.body?.estimatedPrice);
  const scopeOfWork = sanitizeText(req.body?.scopeOfWork, 5000);
  const exclusions = req.body?.exclusions === undefined || req.body?.exclusions === null ? null : sanitizeText(req.body.exclusions, 5000);
  const validityDays = parsePositiveInteger(req.body?.validityDays, 'validityDays') || 7;
  const proposedSchedule = req.body?.proposedSchedule === undefined || req.body?.proposedSchedule === null ? null : sanitizeText(req.body.proposedSchedule, 255);

  if (!requestId || !estimatedPrice || !scopeOfWork) {
    return res.status(400).json({
      message: 'Provide a valid requestId, estimatedPrice, and scopeOfWork.',
    });
  }

  if (validityDays < 1 || validityDays > 365) {
    return res.status(400).json({ message: 'validityDays must be between 1 and 365.' });
  }

  const pool = getPool();
  const [[request]] = await pool.execute(
    `SELECT qr.id, qr.title, qr.provider_id, qr.customer_id, qr.status
       FROM quotation_requests qr
      WHERE qr.id = ? LIMIT 1`,
    [requestId],
  );

  if (!request) {
    return res.status(404).json({ message: 'Quotation request was not found.' });
  }

  const [[profile]] = await pool.execute(
    `SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1`,
    [req.user.id],
  );

  if (!profile) {
    return res.status(404).json({ message: 'Fundi profile was not found.' });
  }

  if (request.provider_id !== profile.id) {
    return res.status(403).json({ message: 'You can only quote requests for your own provider profile.' });
  }

  if (request.status === 'rejected' || request.status === 'cancelled' || request.status === 'expired') {
    return res.status(400).json({ message: 'This request is no longer accepting quotations.' });
  }

  const [[existingQuote]] = await pool.execute(
    `SELECT id FROM quotations WHERE request_id = ? AND provider_id = ? AND status IN ('pending', 'accepted') LIMIT 1`,
    [requestId, profile.id],
  );

  if (existingQuote) {
    return res.status(409).json({ message: 'A quotation for this request has already been submitted.' });
  }

  const [result] = await pool.execute(
    `INSERT INTO quotations (
      request_id, provider_id, customer_id, estimated_price,
      scope_of_work, exclusions, validity_days, proposed_schedule, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      request.id,
      profile.id,
      request.customer_id,
      estimatedPrice,
      scopeOfWork,
      exclusions,
      validityDays,
      proposedSchedule,
    ],
  );

  await pool.execute(
    `UPDATE quotation_requests SET status = 'quoted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [requestId],
  );
  const notification = {
    type: 'quotation_received',
    title: 'New quotation received',
    message: `A provider submitted a quotation for "${request.title}".`,
  };
  await createNotificationForUser(pool, Number(request.customer_id), {
    ...notification,
    entityType: 'quotation',
    entityId: result.insertId,
  });
  await emailNotificationForUser(Number(request.customer_id), notification);

  const [[quote]] = await pool.execute(
    `SELECT q.id, q.request_id, q.provider_id, q.customer_id, q.estimated_price,
            q.scope_of_work, q.exclusions, q.validity_days, q.proposed_schedule,
            q.status, q.created_at,
          DATE_ADD(q.created_at, INTERVAL q.validity_days DAY) AS expires_at,
            pp.business_name AS provider_business_name
       FROM quotations q
       JOIN provider_profiles pp ON pp.id = q.provider_id
      WHERE q.id = ? LIMIT 1`,
    [result.insertId],
  );

  return res.status(201).json({
    message: 'Quotation submitted successfully.',
    quote: {
      id: String(quote.id),
      requestId: String(quote.request_id),
      provider: {
        id: String(quote.provider_id),
        businessName: quote.provider_business_name,
      },
      customerId: String(quote.customer_id),
      estimatedPrice: Number(quote.estimated_price),
      scopeOfWork: quote.scope_of_work,
      exclusions: quote.exclusions,
      validityDays: quote.validity_days,
      proposedSchedule: quote.proposed_schedule,
      status: quote.status,
      createdAt: quote.created_at,
      expiresAt: quote.expires_at,
    },
  });
});

const respondToQuoteHandler = asyncHandler(async (req, res) => {
  const quoteId = parsePositiveInteger(req.params.quoteId, 'quoteId');
  const decision = req.body?.status;

  if (!quoteId || !['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'Provide a valid quoteId and status of accepted or rejected.' });
  }

  if (req.user.role !== 'customer') {
    return res.status(403).json({ message: 'Only a customer can approve or reject quotations.' });
  }

  let requestedAt = null;
  let location = null;
  let jobDescription = null;
  if (decision === 'accepted') {
    requestedAt = normalizeAppointment(req.body?.requestedAt);
    location = sanitizeText(req.body?.location, 255);
    jobDescription = sanitizeText(req.body?.jobDescription, 5000);
    if (
      !requestedAt ||
      !location ||
      !jobDescription
    ) {
      return res.status(400).json({
        message: 'Accepting a quotation requires a future appointment time, location, and job description.',
      });
    }
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[quote]] = await connection.execute(
      `SELECT q.id, q.request_id, q.customer_id, q.provider_id,
              q.estimated_price, q.status,
              (DATE_ADD(q.created_at, INTERVAL q.validity_days DAY) <= CURRENT_TIMESTAMP) AS is_expired,
              qr.customer_id AS request_customer_id, qr.service_id,
              qr.status AS request_status, s.estimated_duration_hours,
              pp.business_name AS provider_business_name,
              pp.user_id AS provider_user_id
         FROM quotations q
         JOIN quotation_requests qr ON qr.id = q.request_id
         JOIN services s ON s.id = qr.service_id
         JOIN provider_profiles pp ON pp.id = q.provider_id
        WHERE q.id = ? FOR UPDATE`,
      [quoteId],
    );

    if (!quote) {
      await connection.rollback();
      return res.status(404).json({ message: 'Quotation was not found.' });
    }
    if (Number(quote.request_customer_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'You do not have permission to respond to this quotation.' });
    }
    if (decision === 'accepted' && quote.status === 'pending' && Boolean(quote.is_expired)) {
      await connection.execute(
        `UPDATE quotations SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'`,
        [quoteId],
      );
      await connection.execute(
        `UPDATE quotation_requests SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'quoted'`,
        [quote.request_id],
      );
      await connection.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
         VALUES (?, 'quotation_expired', 'quotation', ?, ?)`,
        [req.user.id, quoteId, JSON.stringify({ requestId: quote.request_id })],
      );
      await createNotificationForUser(connection, Number(quote.provider_user_id), {
        type: 'quotation_expired',
        title: 'Quotation expired',
        message: `Your quotation for request ${quote.request_id} expired before the customer responded.`,
        entityType: 'quotation',
        entityId: quoteId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(quote.provider_user_id), {
        type: 'quotation_expired',
        title: 'Quotation expired',
        message: `Your quotation for request ${quote.request_id} expired before the customer responded.`,
      });
      return res.status(409).json({ message: 'This quotation has expired and can no longer be accepted.' });
    }
    if (quote.status !== 'pending') {
      await connection.rollback();
      return res.status(409).json({ message: 'Only pending quotations can be approved or rejected.' });
    }
    if (quote.request_status !== 'quoted') {
      await connection.rollback();
      return res.status(409).json({ message: 'This quotation request has already been closed.' });
    }

    let bookingId = null;
    if (decision === 'accepted') {
      await connection.execute(
        'SELECT id FROM provider_profiles WHERE id = ? FOR UPDATE',
        [quote.provider_id],
      );
      const availabilityError = await validateProviderAppointment(
        connection,
        quote.provider_id,
        requestedAt,
        quote.estimated_duration_hours,
      );
      if (availabilityError) {
        await connection.rollback();
        return res.status(409).json({ message: availabilityError });
      }
      const bookingReference = `FC-${randomUUID().replaceAll('-', '').slice(0, 30).toUpperCase()}`;
      const [bookingResult] = await connection.execute(
        `INSERT INTO bookings (
            customer_id, provider_id, service_id, booking_reference,
            requested_at, location, job_description, agreed_price,
            accepted_quotation_id, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested')`,
        [
          req.user.id,
          quote.provider_id,
          quote.service_id,
          bookingReference,
          requestedAt,
          location,
          jobDescription,
          quote.estimated_price,
          quote.id,
        ],
      );
      bookingId = bookingResult.insertId;
      await connection.execute(
        `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by, note)
         VALUES (?, NULL, 'requested', ?, ?)`,
        [bookingId, req.user.id, `Quotation ${quote.id} accepted; agreed amount ${quote.estimated_price}.`],
      );
      await connection.execute(
        `UPDATE quotations SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [quoteId],
      );
      await connection.execute(
        `UPDATE quotations SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
          WHERE request_id = ? AND id <> ? AND status = 'pending'`,
        [quote.request_id, quoteId],
      );
      await connection.execute(
        `UPDATE quotation_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [quote.request_id],
      );
    } else {
      await connection.execute(
        `UPDATE quotations SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [quoteId],
      );
      await connection.execute(
        `UPDATE quotation_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [quote.request_id],
      );
    }

    await connection.execute(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'quotation', ?, ?)`,
      [
        req.user.id,
        `quotation_${decision}`,
        quoteId,
        JSON.stringify({ requestId: quote.request_id, bookingId }),
      ],
    );
    const notification = {
      type: `quotation_${decision}`,
      title: decision === 'accepted' ? 'Quotation accepted' : 'Quotation declined',
      message: decision === 'accepted'
        ? `Your quotation was accepted and booking ${bookingId} was created.`
        : `Your quotation for request ${quote.request_id} was declined.`,
    };
    await createNotificationForUser(connection, Number(quote.provider_user_id), {
      ...notification,
      entityType: decision === 'accepted' ? 'booking' : 'quotation',
      entityId: bookingId || quoteId,
    });
    await connection.commit();
    await emailNotificationForUser(Number(quote.provider_user_id), notification);

    return res.status(200).json({
      message: decision === 'accepted' ? 'Quotation approved and booking created.' : 'Quotation rejected successfully.',
      quote: {
        id: String(quote.id),
        status: decision,
        provider: {
          id: String(quote.provider_id),
          businessName: quote.provider_business_name,
        },
        requestId: String(quote.request_id),
        bookingId: bookingId === null ? null : String(bookingId),
      },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.use(authenticate);

router.get('/', listRequestsHandler);
router.get('/requests', listRequestsHandler);

router.get(
  '/:requestId',
  asyncHandler(async (req, res) => {
    const requestId = parsePositiveInteger(req.params.requestId, 'requestId');
    if (!requestId) {
      return res.status(400).json({ message: 'Provide a valid quotation request ID.' });
    }

    const pool = getPool();
    const [requestRows] = await pool.execute(
      `SELECT qr.id, qr.title, qr.description, qr.status, qr.created_at,
              qr.customer_id, qr.provider_id, qr.service_id,
              s.name AS service_name,
              pp.business_name AS provider_business_name,
              pp.user_id AS provider_user_id,
              provider_user.first_name AS provider_first_name,
              provider_user.last_name AS provider_last_name,
              customer_user.id AS customer_user_id,
              customer_user.first_name AS customer_first_name,
              customer_user.last_name AS customer_last_name
         FROM quotation_requests qr
         JOIN services s ON s.id = qr.service_id
         JOIN provider_profiles pp ON pp.id = qr.provider_id
         JOIN users provider_user ON provider_user.id = pp.user_id
         JOIN users customer_user ON customer_user.id = qr.customer_id
        WHERE qr.id = ?
          AND (
            qr.customer_id = ?
            OR qr.provider_id = (SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1)
            OR ? = 'admin'
          )
        LIMIT 1`,
      [requestId, req.user.id, req.user.id, req.user.role],
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: 'Quotation request was not found.' });
    }

    const [quoteRows, photoRows] = await Promise.all([
      pool.execute(
      `SELECT q.id, q.estimated_price, q.scope_of_work, q.exclusions, q.validity_days,
              q.proposed_schedule, q.status, q.created_at,
              DATE_ADD(q.created_at, INTERVAL q.validity_days DAY) AS expires_at,
              pp.id AS provider_id, pp.business_name AS provider_business_name
         FROM quotations q
         JOIN provider_profiles pp ON pp.id = q.provider_id
        WHERE q.request_id = ?
        ORDER BY q.created_at DESC, q.id DESC`,
      [requestId],
      ),
      pool.execute(
        `SELECT id, mime_type, size_bytes
           FROM quotation_request_photos
          WHERE request_id = ?
          ORDER BY uploaded_at, id`,
        [requestId],
      ),
    ]);

    const request = requestRows[0];
    return res.status(200).json({
      request: buildRequestSummary(request, quoteRows[0], photoRows[0]),
    });
  }),
);

router.get(
  '/requests/:requestId/photos/:photoId',
  asyncHandler(async (req, res) => {
    const requestId = parsePositiveInteger(req.params.requestId, 'requestId');
    const photoId = parsePositiveInteger(req.params.photoId, 'photoId');
    if (!requestId || !photoId) {
      return res.status(400).json({ message: 'Provide valid quotation request and photo IDs.' });
    }
    const [[photo]] = await getPool().execute(
      `SELECT photo.storage_key, photo.file_extension, photo.mime_type
         FROM quotation_request_photos photo
         JOIN quotation_requests request ON request.id = photo.request_id
        WHERE photo.id = ? AND request.id = ?
          AND (
            request.customer_id = ?
            OR request.provider_id = (SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1)
            OR ? = 'admin'
          )
        LIMIT 1`,
      [photoId, requestId, req.user.id, req.user.id, req.user.role],
    );
    if (!photo) {
      return res.status(404).json({ message: 'Quotation photo was not found.' });
    }
    const contents = await readPhoto('quotation', photo.storage_key, photo.file_extension);
    if (!contents) {
      return res.status(404).json({ message: 'Quotation photo file was not found.' });
    }
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Length': contents.length,
      'Content-Type': photo.mime_type,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(contents);
  }),
);

router.post('/', authorizeRole('customer'), photoUpload.array('photos', 4), createRequestHandler);
router.post('/requests', authorizeRole('customer'), photoUpload.array('photos', 4), createRequestHandler);

router.post('/quote', authorizeRole('fundi'), createQuoteHandler);
router.post('/:requestId/quotes', authorizeRole('fundi'), createQuoteHandler);
router.patch('/quotes/:quoteId', respondToQuoteHandler);
router.patch('/quote/:quoteId', respondToQuoteHandler);

export default router;
