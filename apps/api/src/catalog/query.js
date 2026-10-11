import { normalizeAppointment } from '../bookings/availability.js';

const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 1_000_000;
const SORT_OPTIONS = new Set(['newest', 'price_asc', 'price_desc']);
const PRICE_PATTERN = /^\d{1,8}(?:\.\d{1,2})?$/;

function readText(query, field, maxLength) {
  const value = query[field];
  if (value === undefined) {
    return { valid: true, value: '' };
  }
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    return { valid: false };
  }
  return { valid: true, value: value.trim() };
}

function readPositiveInteger(query, field, defaultValue, maxValue) {
  const value = query[field];
  if (value === undefined) {
    return { valid: true, value: defaultValue };
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return { valid: false };
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maxValue
    ? { valid: true, value: parsed }
    : { valid: false };
}

function readPrice(query, field) {
  const value = query[field];
  if (value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value !== 'string' || !PRICE_PATTERN.test(value)) {
    return { valid: false };
  }
  return { valid: true, value: Number(value) };
}

export function parseServiceQuery(query) {
  const q = readText(query, 'q', 100);
  const category = readText(query, 'category', 150);
  const town = readText(query, 'town', 100);
  const area = readText(query, 'area', 150);
  const availableAt = readText(query, 'availableAt', 40);
  const normalizedAvailableAt = availableAt.valid && availableAt.value
    ? normalizeAppointment(availableAt.value)
    : null;
  const minPrice = readPrice(query, 'minPrice');
  const maxPrice = readPrice(query, 'maxPrice');
  const minRating = readPositiveInteger(query, 'minRating', null, 5);
  const page = readPositiveInteger(query, 'page', 1, MAX_PAGE);
  const pageSize = readPositiveInteger(query, 'pageSize', 20, MAX_PAGE_SIZE);
  const sort = query.sort === undefined ? 'newest' : query.sort;

  if (
    !q.valid ||
    !category.valid ||
    !town.valid ||
    !area.valid ||
    !availableAt.valid ||
    (availableAt.value && !normalizedAvailableAt) ||
    !minPrice.valid ||
    !maxPrice.valid ||
    !minRating.valid ||
    !page.valid ||
    !pageSize.valid ||
    typeof sort !== 'string' ||
    !SORT_OPTIONS.has(sort) ||
    (minPrice.value !== null && maxPrice.value !== null && minPrice.value > maxPrice.value)
  ) {
    return {
      valid: false,
      message: 'Provide valid search, location, price, pagination, and sort filters.',
    };
  }

  return {
    valid: true,
    filters: {
      q: q.value,
      category: category.value,
      town: town.value,
      area: area.value,
      availableAt: normalizedAvailableAt,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      minRating: minRating.value,
      page: page.value,
      pageSize: pageSize.value,
      sort,
    },
  };
}

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function buildServiceFilters(filters) {
  const clauses = [
    's.is_active = TRUE',
    'c.is_active = TRUE',
    "u.role = 'fundi'",
    "u.account_status = 'active'",
    'pp.is_verified = TRUE',
    "pp.verification_status = 'approved'",
  ];
  const parameters = [];

  if (filters.q) {
    const pattern = likePattern(filters.q);
    clauses.push(
      `(s.name LIKE ? OR s.description LIKE ? OR c.name LIKE ? OR pp.business_name LIKE ?)`,
    );
    parameters.push(pattern, pattern, pattern, pattern);
  }
  if (filters.category) {
    clauses.push('c.slug = ?');
    parameters.push(filters.category);
  }
  if (filters.minPrice !== null) {
    clauses.push('s.price >= ?');
    parameters.push(filters.minPrice);
  }
  if (filters.maxPrice !== null) {
    clauses.push('s.price <= ?');
    parameters.push(filters.maxPrice);
  }
  if (filters.minRating !== null) {
    clauses.push(
      '(SELECT AVG(r.rating) FROM reviews r WHERE r.provider_id = pp.id) >= ?',
    );
    parameters.push(filters.minRating);
  }
  if (filters.availableAt !== null) {
    clauses.push(
      `(EXISTS (
         SELECT 1 FROM provider_availability pa
          WHERE pa.provider_id = pp.id
            AND pa.weekday = DAYOFWEEK(?) - 1
            AND TIMESTAMP(DATE(?), pa.start_time) <= ?
            AND TIMESTAMP(DATE(?), pa.end_time) >= DATE_ADD(?, INTERVAL COALESCE(s.estimated_duration_hours, 1) HOUR)
       )
       AND NOT EXISTS (
         SELECT 1
           FROM bookings b
           JOIN services booked_service ON booked_service.id = b.service_id
          WHERE b.provider_id = pp.id
            AND b.status IN ('requested', 'quoted', 'confirmed', 'accepted', 'in_progress')
            AND b.requested_at < DATE_ADD(?, INTERVAL COALESCE(s.estimated_duration_hours, 1) HOUR)
            AND DATE_ADD(b.requested_at, INTERVAL COALESCE(booked_service.estimated_duration_hours, 1) HOUR) > ?
       ))`,
    );
    parameters.push(
      filters.availableAt,
      filters.availableAt,
      filters.availableAt,
      filters.availableAt,
      filters.availableAt,
      filters.availableAt,
      filters.availableAt,
    );
  }
  if (filters.town || filters.area) {
    const locationClauses = ['psa.provider_id = pp.id'];
    if (filters.town) {
      locationClauses.push('psa.town LIKE ?');
      parameters.push(likePattern(filters.town));
    }
    if (filters.area) {
      locationClauses.push('psa.area LIKE ?');
      parameters.push(likePattern(filters.area));
    }
    clauses.push(
      `EXISTS (SELECT 1 FROM provider_service_areas psa WHERE ${locationClauses.join(' AND ')})`,
    );
  }

  return { whereSql: clauses.join(' AND '), parameters };
}

export function getServiceSortOrder(sort) {
  if (sort === 'price_asc') {
    return 's.price IS NULL, s.price ASC, s.id DESC';
  }
  if (sort === 'price_desc') {
    return 's.price IS NULL, s.price DESC, s.id DESC';
  }
  return 's.created_at DESC, s.id DESC';
}
