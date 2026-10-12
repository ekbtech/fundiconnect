import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildServiceFilters,
  getServiceSortOrder,
  parseServiceQuery,
} from './query.js';

test('service query uses documented defaults', () => {
  assert.deepEqual(parseServiceQuery({}), {
    valid: true,
    filters: {
      q: '',
      category: '',
      town: '',
      area: '',
      availableAt: null,
      minPrice: null,
      maxPrice: null,
      minRating: null,
      page: 1,
      pageSize: 20,
      sort: 'newest',
    },
  });
});

test('service query accepts valid filters and rejects invalid ranges', () => {
  const parsed = parseServiceQuery({
    q: ' electrician ',
    category: 'electrical-services',
    town: 'Nairobi',
    area: 'Westlands',
    availableAt: '2099-01-01T09:00',
    minPrice: '1000',
    maxPrice: '2500.50',
    minRating: '4',
    page: '2',
    pageSize: '10',
    sort: 'price_asc',
  });

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.filters, {
    q: 'electrician',
    category: 'electrical-services',
    town: 'Nairobi',
    area: 'Westlands',
    availableAt: '2099-01-01 09:00:00',
    minPrice: 1000,
    maxPrice: 2500.5,
    minRating: 4,
    page: 2,
    pageSize: 10,
    sort: 'price_asc',
  });
  assert.equal(parseServiceQuery({ minPrice: '200', maxPrice: '100' }).valid, false);
});

test('service query rejects unsafe or unsupported pagination and sorting', () => {
  assert.equal(parseServiceQuery({ page: '0' }).valid, false);
  assert.equal(parseServiceQuery({ pageSize: '51' }).valid, false);
  assert.equal(parseServiceQuery({ minRating: '0' }).valid, false);
  assert.equal(parseServiceQuery({ minRating: '6' }).valid, false);
  assert.equal(parseServiceQuery({ sort: 'rating' }).valid, false);
  assert.equal(parseServiceQuery({ q: ['plumber'] }).valid, false);
});

test('service filters parameterize user data and require approved public listings', () => {
  const filters = {
    q: '100%_safe',
    category: 'plumbing',
    town: 'Nairobi',
    area: 'Westlands',
    availableAt: '2099-01-01 09:00:00',
    minPrice: null,
    maxPrice: null,
    minRating: 4,
  };

  const built = buildServiceFilters(filters);
  assert.match(built.whereSql, /pp\.is_verified = TRUE/);
  assert.match(built.whereSql, /pp\.verification_status = 'approved'/);
  assert.match(built.whereSql, /u\.account_status = 'active'/);
  assert.match(built.whereSql, /EXISTS \(SELECT 1 FROM provider_service_areas/);
  assert.match(built.whereSql, /SELECT AVG\(r\.rating\) FROM reviews r WHERE r\.provider_id = pp\.id AND r\.is_visible = TRUE/);
  assert.match(built.whereSql, /provider_availability pa/);
  assert.match(built.whereSql, /NOT EXISTS \(/);
  assert.doesNotMatch(built.whereSql, /100%_safe|Nairobi|Westlands|plumbing/);
  assert.deepEqual(built.parameters, [
    '%100\\%\\_safe%',
    '%100\\%\\_safe%',
    '%100\\%\\_safe%',
    '%100\\%\\_safe%',
    'plumbing',
    4,
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '2099-01-01 09:00:00',
    '%Nairobi%',
    '%Westlands%',
  ]);
});

test('service sort clauses are selected from a fixed allow-list', () => {
  assert.equal(getServiceSortOrder('price_asc'), 's.price IS NULL, s.price ASC, s.id DESC');
  assert.equal(getServiceSortOrder('price_desc'), 's.price IS NULL, s.price DESC, s.id DESC');
  assert.equal(getServiceSortOrder('unexpected'), 's.created_at DESC, s.id DESC');
});
