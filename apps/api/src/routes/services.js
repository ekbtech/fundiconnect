import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  buildServiceFilters,
  getServiceSortOrder,
  parseServiceQuery,
} from '../catalog/query.js';

const router = Router();

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const [categories] = await getPool().execute(
      `SELECT id, name, slug, description
         FROM service_categories
        WHERE is_active = TRUE
        ORDER BY name ASC, id ASC`,
    );

    return res.status(200).json({ categories });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = parseServiceQuery(req.query);
    if (!parsed.valid) {
      return res.status(400).json({ message: parsed.message });
    }

    const { filters } = parsed;
    const pool = getPool();
    const { whereSql, parameters } = buildServiceFilters(filters);
    const offset = (filters.page - 1) * filters.pageSize;
    const [services] = await pool.execute(
      `SELECT s.id, s.name, s.description, s.pricing_model, s.price,
              s.estimated_duration_hours, s.created_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
              pp.id AS provider_id, pp.business_name, pp.bio, pp.experience_years,
              pp.is_verified, u.id AS provider_user_id, u.first_name, u.last_name, u.profile_photo,
              (SELECT AVG(r.rating) FROM reviews r WHERE r.provider_id = pp.id) AS average_rating,
              (SELECT COUNT(*) FROM reviews r WHERE r.provider_id = pp.id) AS total_reviews
         FROM services s
         JOIN service_categories c ON c.id = s.category_id
         JOIN provider_profiles pp ON pp.id = s.provider_id
         JOIN users u ON u.id = pp.user_id
        WHERE ${whereSql}
        ORDER BY ${getServiceSortOrder(filters.sort)}
        LIMIT ? OFFSET ?`,
      [...parameters, String(filters.pageSize), String(offset)],
    );
    const [[countResult]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM services s
         JOIN service_categories c ON c.id = s.category_id
         JOIN provider_profiles pp ON pp.id = s.provider_id
         JOIN users u ON u.id = pp.user_id
        WHERE ${whereSql}`,
      parameters,
    );

    let locationsByProvider = new Map();
    if (services.length > 0) {
      const providerIds = [...new Set(services.map((service) => service.provider_id))];
      const placeholders = providerIds.map(() => '?').join(', ');
      const [locations] = await pool.execute(
        `SELECT provider_id, county, town, area
           FROM provider_service_areas
          WHERE provider_id IN (${placeholders})
          ORDER BY county ASC, town ASC, area ASC`,
        providerIds,
      );
      locationsByProvider = locations.reduce((map, location) => {
        const providerLocations = map.get(location.provider_id) || [];
        providerLocations.push({
          county: location.county,
          town: location.town,
          area: location.area,
        });
        map.set(location.provider_id, providerLocations);
        return map;
      }, new Map());
    }

    const total = Number(countResult.total);
    return res.status(200).json({
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        pricingModel: service.pricing_model,
        price: service.price === null ? null : Number(service.price),
        estimatedDurationHours: service.estimated_duration_hours,
        createdAt: service.created_at,
        category: {
          id: service.category_id,
          name: service.category_name,
          slug: service.category_slug,
        },
        provider: {
          id: service.provider_id,
          businessName: service.business_name,
          bio: service.bio,
          experienceYears: service.experience_years,
          isVerified: Boolean(service.is_verified),
          averageRating: service.average_rating === null ? null : Number(service.average_rating),
          totalReviews: Number(service.total_reviews),
          firstName: service.first_name,
          lastName: service.last_name,
          profilePhoto: service.profile_photo
            ? `/api/v1/users/${service.provider_user_id}/profile-photo`
            : null,
          serviceAreas: locationsByProvider.get(service.provider_id) || [],
        },
      })),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    });
  }),
);

export default router;
