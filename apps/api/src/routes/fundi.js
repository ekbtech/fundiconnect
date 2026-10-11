import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { parseWeeklyAvailability } from '../bookings/availability.js';
import {
  BOOKING_REQUEST_EXPIRY_HOURS,
  expireOverdueBookingRequests,
} from '../bookings/expiry.js';
import { jobTransitions, validateFundiBookingUpdate } from '../bookings/lifecycle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize-role.js';
import {
  removeVerificationDocument,
  readVerificationDocument,
  storeVerificationDocument,
  validateVerificationDocument,
  verificationDocumentUpload,
} from '../uploads/verification-documents.js';
import { createNotificationForUser, emailNotificationForUser } from './notifications.js';

const router = Router();
const servicePricingModels = new Set(['fixed', 'starting_price', 'quote']);

function readService(body) {
  const {
    name,
    description,
    categoryId,
    pricingModel,
    price,
    estimatedDurationHours,
  } = body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const parsedCategoryId = Number(categoryId);
  const parsedPrice = price === null || price === '' || price === undefined ? null : Number(price);
  const parsedDuration =
    estimatedDurationHours === null || estimatedDurationHours === '' ||
    estimatedDurationHours === undefined
      ? null
      : Number(estimatedDurationHours);

  if (
    normalizedName.length < 2 ||
    normalizedName.length > 200 ||
    normalizedDescription.length < 10 ||
    normalizedDescription.length > 5000 ||
    !Number.isSafeInteger(parsedCategoryId) ||
    parsedCategoryId < 1 ||
    !servicePricingModels.has(pricingModel) ||
    (pricingModel !== 'quote' && (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 99999999)) ||
    (pricingModel === 'quote' && parsedPrice !== null) ||
    (parsedDuration !== null &&
      (!Number.isSafeInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 10000))
  ) {
    return null;
  }

  return {
    name: normalizedName,
    description: normalizedDescription,
    categoryId: parsedCategoryId,
    pricingModel,
    price: pricingModel === 'quote' ? null : parsedPrice,
    estimatedDurationHours: parsedDuration,
  };
}

function readServiceArea(body) {
  const county = typeof body?.county === 'string' ? body.county.trim() : '';
  const town = typeof body?.town === 'string' ? body.town.trim() : '';
  const area = body?.area === undefined ? '' : typeof body.area === 'string' ? body.area.trim() : null;
  if (
    !county ||
    county.length > 100 ||
    !town ||
    town.length > 100 ||
    area === null ||
    area.length > 150
  ) {
    return null;
  }
  return { county, town, area };
}

router.use(authenticate, authorizeRole('fundi'));

router.post(
  '/verification-documents',
  verificationDocumentUpload.single('document'),
  asyncHandler(async (req, res) => {
    const document = validateVerificationDocument(req.file, req.body?.documentType);
    if (!document) {
      return res.status(400).json({
        message: 'Choose an identity or qualification document and upload a valid PDF, JPEG, or PNG file no larger than 5 MB.',
      });
    }

    const connection = await getPool().getConnection();
    let storedPath = null;
    try {
      await connection.beginTransaction();
      const [[profile]] = await connection.execute(
        'SELECT id FROM provider_profiles WHERE user_id = ? FOR UPDATE',
        [req.user.id],
      );
      if (!profile) {
        await connection.rollback();
        return res.status(404).json({ message: 'Fundi profile was not found.' });
      }

      storedPath = await storeVerificationDocument(
        document.storageKey,
        document.extension,
        req.file.buffer,
      );
      const [result] = await connection.execute(
        `INSERT INTO provider_verification_documents (
            provider_id, document_type, storage_key, file_extension, mime_type,
            original_filename, size_bytes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.id,
          document.documentType,
          document.storageKey,
          document.extension,
          document.mimeType,
          document.originalFilename,
          document.sizeBytes,
        ],
      );
      await connection.execute(
        `UPDATE provider_profiles
            SET verification_status = IF(verification_status = 'rejected', 'resubmitted', verification_status)
          WHERE id = ?`,
        [profile.id],
      );
      await connection.commit();
      return res.status(201).json({
        message: 'Verification document submitted privately for administrator review.',
        document: {
          id: String(result.insertId),
          documentType: document.documentType,
          originalFilename: document.originalFilename,
          sizeBytes: document.sizeBytes,
        },
      });
    } catch (error) {
      await connection.rollback();
      if (storedPath) {
        try {
          await removeVerificationDocument(storedPath);
        } catch (cleanupError) {
          console.error('Could not remove an unlinked verification upload.', cleanupError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
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
      `SELECT d.storage_key, d.file_extension
         FROM provider_verification_documents d
         JOIN provider_profiles pp ON pp.id = d.provider_id
        WHERE d.id = ? AND pp.user_id = ?
        LIMIT 1`,
      [documentId, req.user.id],
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

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const pool = getPool();
    await expireOverdueBookingRequests(pool);
    const [[profile]] = await pool.execute(
      `SELECT id, business_name, bio, experience_years, verification_status, is_verified
         FROM provider_profiles WHERE user_id = ? LIMIT 1`,
      [req.user.id],
    );
    if (!profile) {
      return res.status(404).json({ message: 'Fundi profile was not found.' });
    }

    const [[bookingCounts]] = await pool.execute(
      `SELECT
          SUM(status IN ('requested', 'quoted', 'confirmed')) AS pending_jobs,
          SUM(status IN ('accepted', 'in_progress')) AS active_jobs,
          SUM(status IN ('completed', 'closed')) AS completed_jobs
         FROM bookings WHERE provider_id = ?`,
      [profile.id],
    );
    const [[earnings]] = await pool.execute(
      `SELECT COALESCE(SUM(agreed_price), 0) AS completed_job_value
         FROM bookings
        WHERE provider_id = ? AND status IN ('completed', 'closed')`,
      [profile.id],
    );
    const [bookings] = await pool.execute(
      `SELECT b.id, b.booking_reference, b.requested_at, b.location, b.job_description,
              b.agreed_price, b.status, b.completion_summary, b.completed_at,
              b.completion_confirmed_at, b.created_at,
              s.name AS service_name, u.first_name AS customer_first_name,
              u.last_name AS customer_last_name
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN users u ON u.id = b.customer_id
        WHERE b.provider_id = ?
        ORDER BY b.requested_at ASC, b.id DESC
        LIMIT 10`,
      [profile.id],
    );
    const [services] = await pool.execute(
      `SELECT s.id, s.name, s.description, s.pricing_model, s.price,
              s.estimated_duration_hours, s.is_active, c.name AS category_name
         FROM services s
         JOIN service_categories c ON c.id = s.category_id
        WHERE s.provider_id = ?
        ORDER BY s.is_active DESC, s.created_at DESC`,
      [profile.id],
    );
    const [serviceAreas] = await pool.execute(
      `SELECT id, county, town, area
         FROM provider_service_areas
        WHERE provider_id = ?
        ORDER BY county, town, area`,
      [profile.id],
    );
    const [availability] = await pool.execute(
      `SELECT weekday, TIME_FORMAT(start_time, '%H:%i') AS start_time,
              TIME_FORMAT(end_time, '%H:%i') AS end_time
         FROM provider_availability
        WHERE provider_id = ?
      ORDER BY weekday, start_time`,
      [profile.id],
    );
    const [verificationDocuments] = await pool.execute(
      `SELECT id, document_type, original_filename, size_bytes, uploaded_at
         FROM provider_verification_documents
        WHERE provider_id = ?
        ORDER BY uploaded_at DESC, id DESC`,
      [profile.id],
    );

    return res.status(200).json({
      profile: {
        id: String(profile.id),
        businessName: profile.business_name,
        bio: profile.bio,
        experienceYears: profile.experience_years,
        verificationStatus: profile.verification_status,
        isVerified: Boolean(profile.is_verified),
      },
      stats: {
        pendingJobs: Number(bookingCounts.pending_jobs || 0),
        activeJobs: Number(bookingCounts.active_jobs || 0),
        completedJobs: Number(bookingCounts.completed_jobs || 0),
        completedJobValue: Number(earnings.completed_job_value),
      },
      bookings: bookings.map((booking) => ({
        id: String(booking.id),
        reference: booking.booking_reference,
        requestedAt: booking.requested_at,
        location: booking.location,
        description: booking.job_description,
        agreedPrice: booking.agreed_price === null ? null : Number(booking.agreed_price),
        status: booking.status,
        completionSummary: booking.completion_summary,
        completedAt: booking.completed_at,
        completionConfirmedAt: booking.completion_confirmed_at,
        serviceName: booking.service_name,
        customerName: `${booking.customer_first_name} ${booking.customer_last_name}`,
      })),
      services: services.map((service) => ({
        id: String(service.id),
        name: service.name,
        description: service.description,
        pricingModel: service.pricing_model,
        price: service.price === null ? null : Number(service.price),
        estimatedDurationHours: service.estimated_duration_hours,
        isActive: Boolean(service.is_active),
        categoryName: service.category_name,
      })),
      serviceAreas: serviceAreas.map((location) => ({
        id: String(location.id),
        county: location.county,
        town: location.town,
        area: location.area,
      })),
      availability: availability.map((slot) => ({
        weekday: Number(slot.weekday),
        startTime: slot.start_time,
        endTime: slot.end_time,
      })),
      verificationDocuments: verificationDocuments.map((document) => ({
        id: String(document.id),
        documentType: document.document_type,
        originalFilename: document.original_filename,
        sizeBytes: Number(document.size_bytes),
        uploadedAt: document.uploaded_at,
      })),
    });
  }),
);

router.put(
  '/availability',
  asyncHandler(async (req, res) => {
    const availability = parseWeeklyAvailability(req.body?.availability);
    if (!availability) {
      return res.status(400).json({
        message: 'Provide valid, non-overlapping availability windows using 24-hour HH:mm times.',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [profiles] = await connection.execute(
        'SELECT id FROM provider_profiles WHERE user_id = ? FOR UPDATE',
        [req.user.id],
      );
      if (profiles.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Fundi profile was not found.' });
      }
      const providerId = profiles[0].id;
      await connection.execute(
        'DELETE FROM provider_availability WHERE provider_id = ?',
        [providerId],
      );
      for (const slot of availability) {
        await connection.execute(
          `INSERT INTO provider_availability (provider_id, weekday, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [providerId, slot.weekday, `${slot.startTime}:00`, `${slot.endTime}:00`],
        );
      }
      await connection.commit();
      return res.status(200).json({
        message: 'Weekly availability updated.',
        availability,
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
  '/profile',
  asyncHandler(async (req, res) => {
    const allowedFields = new Set(['businessName', 'bio', 'experienceYears']);
    const entries = Object.entries(req.body || {});
    if (
      entries.length === 0 ||
      entries.some(([field]) => !allowedFields.has(field))
    ) {
      return res.status(400).json({ message: 'Provide businessName, bio, or experienceYears to update.' });
    }

    const values = [];
    const assignments = [];
    for (const [field, value] of entries) {
      if (field === 'businessName' || field === 'bio') {
        if (value !== null && (typeof value !== 'string' || value.trim().length > (field === 'bio' ? 5000 : 255))) {
          return res.status(400).json({ message: `${field} has an invalid value.` });
        }
        assignments.push(`${field === 'businessName' ? 'business_name' : 'bio'} = ?`);
        values.push(typeof value === 'string' ? value.trim() || null : null);
      } else {
        if (!Number.isSafeInteger(value) || value < 0 || value > 80) {
          return res.status(400).json({ message: 'experienceYears must be a whole number from 0 to 80.' });
        }
        assignments.push('experience_years = ?');
        values.push(value);
      }
    }

    values.push(req.user.id);
    const pool = getPool();
    const [profiles] = await pool.execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Fundi profile was not found.' });
    }
    await pool.execute(
      `UPDATE provider_profiles SET ${assignments.join(', ')} WHERE user_id = ?`,
      values,
    );
    return res.status(200).json({ message: 'Fundi profile updated.' });
  }),
);

router.post(
  '/services',
  asyncHandler(async (req, res) => {
    const service = readService(req.body);
    if (!service) {
      return res.status(400).json({ message: 'Provide valid service details, pricing, and category.' });
    }
    const [[profile]] = await getPool().execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    if (!profile) {
      return res.status(404).json({ message: 'Fundi profile was not found.' });
    }
    const [categories] = await getPool().execute(
      'SELECT id FROM service_categories WHERE id = ? AND is_active = TRUE',
      [service.categoryId],
    );
    if (categories.length === 0) {
      return res.status(400).json({ message: 'Choose an active service category.' });
    }
    const [result] = await getPool().execute(
      `INSERT INTO services
        (provider_id, category_id, name, description, pricing_model, price, estimated_duration_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        service.categoryId,
        service.name,
        service.description,
        service.pricingModel,
        service.price,
        service.estimatedDurationHours,
      ],
    );
    return res.status(201).json({ message: 'Service created.', serviceId: String(result.insertId) });
  }),
);

router.patch(
  '/services/:serviceId',
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    const service = readService(req.body);
    if (!Number.isSafeInteger(serviceId) || serviceId < 1 || !service) {
      return res.status(400).json({ message: 'Provide a valid service ID and service details.' });
    }
    const [[profile]] = await getPool().execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    const [categories] = await getPool().execute(
      'SELECT id FROM service_categories WHERE id = ? AND is_active = TRUE',
      [service.categoryId],
    );
    if (categories.length === 0) {
      return res.status(400).json({ message: 'Choose an active service category.' });
    }
    const [ownedServices] = await getPool().execute(
      'SELECT id FROM services WHERE id = ? AND provider_id = ? LIMIT 1',
      [serviceId, profile.id],
    );
    if (ownedServices.length === 0) {
      return res.status(404).json({ message: 'Service was not found.' });
    }
    await getPool().execute(
      `UPDATE services
          SET category_id = ?, name = ?, description = ?, pricing_model = ?, price = ?,
              estimated_duration_hours = ?
        WHERE id = ? AND provider_id = ?`,
      [
        service.categoryId,
        service.name,
        service.description,
        service.pricingModel,
        service.price,
        service.estimatedDurationHours,
        serviceId,
        profile.id,
      ],
    );
    return res.status(200).json({ message: 'Service updated.' });
  }),
);

router.delete(
  '/services/:serviceId',
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.params.serviceId);
    if (!Number.isSafeInteger(serviceId) || serviceId < 1) {
      return res.status(400).json({ message: 'Provide a valid service ID.' });
    }
    const [[profile]] = await getPool().execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    const [result] = await getPool().execute(
      'UPDATE services SET is_active = FALSE WHERE id = ? AND provider_id = ?',
      [serviceId, profile.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Service was not found.' });
    }
    return res.status(200).json({ message: 'Service listing deactivated.' });
  }),
);

router.post(
  '/service-areas',
  asyncHandler(async (req, res) => {
    const location = readServiceArea(req.body);
    if (!location) {
      return res.status(400).json({ message: 'Provide a county, town, and optional area.' });
    }
    const [[profile]] = await getPool().execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    const [result] = await getPool().execute(
      `INSERT INTO provider_service_areas (provider_id, county, town, area)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [profile.id, location.county, location.town, location.area],
    );
    return res.status(201).json({ message: 'Service area saved.', serviceAreaId: String(result.insertId) });
  }),
);

router.delete(
  '/service-areas/:areaId',
  asyncHandler(async (req, res) => {
    const areaId = Number(req.params.areaId);
    if (!Number.isSafeInteger(areaId) || areaId < 1) {
      return res.status(400).json({ message: 'Provide a valid service area ID.' });
    }
    const [[profile]] = await getPool().execute(
      'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );
    const [result] = await getPool().execute(
      'DELETE FROM provider_service_areas WHERE id = ? AND provider_id = ?',
      [areaId, profile.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Service area was not found.' });
    }
    return res.status(200).json({ message: 'Service area removed.' });
  }),
);

router.patch(
  '/bookings/:bookingId/status',
  asyncHandler(async (req, res) => {
    await expireOverdueBookingRequests(getPool());
    const bookingId = Number(req.params.bookingId);
    const update = validateFundiBookingUpdate(req.body);
    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId < 1 ||
      !update
    ) {
      return res.status(400).json({
        message: 'Provide a valid booking status, a reason of at least 3 characters when declining, or a completion summary of 10 to 2000 characters when completing a job.',
      });
    }
    const { status, reason, completionSummary } = update;

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [profiles] = await connection.execute(
        'SELECT id FROM provider_profiles WHERE user_id = ? LIMIT 1',
        [req.user.id],
      );
      if (profiles.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Fundi profile was not found.' });
      }
      const [bookings] = await connection.execute(
        `SELECT id, status, customer_id, booking_reference,
                created_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${BOOKING_REQUEST_EXPIRY_HOURS} HOUR) AS request_expired
           FROM bookings WHERE id = ? AND provider_id = ? FOR UPDATE`,
        [bookingId, profiles[0].id],
      );
      if (bookings.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Booking was not found.' });
      }
      const previousStatus = bookings[0].status;
      if (
        ['requested', 'confirmed'].includes(previousStatus) &&
        Boolean(bookings[0].request_expired)
      ) {
        await connection.rollback();
        await expireOverdueBookingRequests(pool);
        return res.status(409).json({ message: 'This booking request has expired.' });
      }
      if (!jobTransitions[previousStatus]?.has(status)) {
        await connection.rollback();
        return res.status(409).json({
          message: `A booking cannot transition from ${previousStatus} to ${status}.`,
        });
      }
      if (status === 'completed') {
        await connection.execute(
          `UPDATE bookings
              SET status = ?, completion_summary = ?, completed_at = CURRENT_TIMESTAMP,
                  completion_confirmed_at = NULL
            WHERE id = ?`,
          [status, completionSummary, bookingId],
        );
      } else {
        await connection.execute(
          'UPDATE bookings SET status = ? WHERE id = ?',
          [status, bookingId],
        );
      }
      await connection.execute(
        `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by, note)
         VALUES (?, ?, ?, ?, ?)`,
        [
          bookingId,
          previousStatus,
          status,
          req.user.id,
          status === 'completed' ? completionSummary : reason || null,
        ],
      );
      const notification = {
        type: `booking_${status}`,
        title: status === 'rejected' ? 'Booking declined' : status === 'completed' ? 'Work marked complete' : 'Booking status updated',
        message: status === 'completed'
          ? `Work for booking ${bookings[0].booking_reference} is marked complete. Review the completion summary and confirm the job.`
          : `Booking ${bookings[0].booking_reference} is now ${status.replaceAll('_', ' ')}.`,
      };
      await createNotificationForUser(connection, Number(bookings[0].customer_id), {
        ...notification,
        entityType: 'booking',
        entityId: bookingId,
      });
      await connection.commit();
      await emailNotificationForUser(Number(bookings[0].customer_id), notification);
      return res.status(200).json({ message: 'Booking status updated.', status });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

export default router;
