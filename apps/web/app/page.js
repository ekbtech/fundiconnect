'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from './lib/api.js';

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const initialFilters = {
  q: '',
  category: '',
  town: '',
  area: '',
  minPrice: '',
  maxPrice: '',
  minRating: '',
  availableAt: '',
  sort: 'newest',
};

async function readResponse(response, fallbackMessage) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(response.ok ? 'The server returned an invalid response.' : fallbackMessage);
  }
  if (!response.ok) {
    throw new Error(result?.message || fallbackMessage);
  }
  return result;
}

function getProviderName(provider) {
  return provider.businessName || `${provider.firstName} ${provider.lastName}`;
}

function ServiceCard({ service }) {
  const provider = service.provider;
  const providerName = getProviderName(provider);
  const initials = providerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-5 flex items-start justify-between gap-4">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {service.category.name}
        </span>
        {provider.isVerified && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <span aria-hidden="true">✓</span>
            Verified
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-slate-900">{service.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{service.description}</p>

      <div className="mt-5 border-t border-stone-100 pt-4">
        <p className="font-bold text-slate-900">
          {service.price === null
            ? 'Request a quote'
            : `${service.pricingModel === 'starting_price' ? 'From ' : ''}${CURRENCY_FORMATTER.format(service.price)}`}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {service.estimatedDurationHours
            ? `Estimated ${service.estimatedDurationHours} ${service.estimatedDurationHours === 1 ? 'hour' : 'hours'}`
            : 'Duration agreed with the provider'}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3 pt-5">
        {provider.profilePhoto ? (
          <img
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
            src={`${getApiUrl()}${provider.profilePhoto}`}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-amber-300"
          >
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{providerName}</p>
          <p className="text-xs text-slate-500">
            {provider.totalReviews > 0
              ? `${provider.averageRating.toFixed(1)} / 5 (${provider.totalReviews} ${provider.totalReviews === 1 ? 'review' : 'reviews'})`
              : 'No reviews yet'}
          </p>
          <p className="truncate text-xs text-slate-500">
            {provider.serviceAreas.length > 0
              ? [...new Set(provider.serviceAreas.map((location) => location.town))].join(', ')
              : `${provider.experienceYears || 0} years' experience`}
          </p>
        </div>
      </div>
      <a
        className="mt-4 inline-flex justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        href={`/customer/dashboard?serviceId=${encodeURIComponent(service.id)}&intent=${service.pricingModel === 'quote' ? 'quote' : 'booking'}`}
      >
        {service.pricingModel === 'quote' ? 'Request a quote' : 'Book this service'}
      </a>
    </article>
  );
}

export default function HomePage() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [services, setServices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 12, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch(`${getApiUrl()}/services/categories`, {
          signal: controller.signal,
        });
        const result = await readResponse(response, 'Could not load service categories.');
        if (!Array.isArray(result?.categories)) {
          throw new Error('The server returned an unexpected service category response.');
        }
        setCategories(result.categories);
        setCategoriesError('');
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setCategoriesError(loadError.message);
        }
      }
    }

    loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        searchParams.set(key, value);
      }
    }
    searchParams.set('page', String(pagination.page));
    searchParams.set('pageSize', '12');

    async function loadServices() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${getApiUrl()}/services?${searchParams.toString()}`, {
          signal: controller.signal,
        });
        const result = await readResponse(response, 'Could not load service listings.');
        if (!Array.isArray(result?.services) || !result.pagination) {
          throw new Error('The server returned an unexpected service listing response.');
        }
        setServices(result.services);
        setPagination(result.pagination);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setServices([]);
          setError(loadError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadServices();
    return () => controller.abort();
  }, [filters, pagination.page]);

  function updateDraft(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function searchServices(event) {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setFilters({ ...draft });
  }

  function clearFilters() {
    setDraft(initialFilters);
    setPagination((current) => ({ ...current, page: 1 }));
    setFilters({ ...initialFilters });
  }

  function changePage(page) {
    setPagination((current) => ({ ...current, page }));
    document.getElementById('service-results')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="text-xl font-black tracking-tight text-slate-900">
            Fundi<span className="text-amber-600">Connect</span>
          </a>
          <nav aria-label="Main navigation" className="flex items-center gap-3 text-xs font-medium text-slate-600 sm:gap-5 sm:text-sm">
            <a className="hover:text-slate-950" href="#service-results">Find a fundi</a>
            <a className="hover:text-slate-950" href="#how-it-works">How it works</a>
            <a className="hover:text-slate-950" href="/login">Sign in</a>
            <a className="rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950 hover:bg-amber-300" href="/register">Join</a>
          </nav>
        </div>
      </header>

      <section className="bg-slate-950">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            Kenya&apos;s local service marketplace
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Find the right fundi for the job.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Discover trusted local professionals, compare services and prices, and find help in your area.
          </p>

          <form
            onSubmit={searchServices}
            className="mt-9 grid gap-3 rounded-2xl bg-white p-4 shadow-xl sm:grid-cols-2 lg:grid-cols-6 lg:p-5"
            aria-label="Search services"
          >
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">What do you need?</span>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                name="q"
                onChange={updateDraft}
                placeholder="e.g. leaking tap, wiring"
                value={draft.q}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Category</span>
              <select
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                name="category"
                onChange={updateDraft}
                value={draft.category}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Town</span>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                name="town"
                onChange={updateDraft}
                placeholder="e.g. Nairobi"
                value={draft.town}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Area</span>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                name="area"
                onChange={updateDraft}
                placeholder="e.g. Westlands"
                value={draft.area}
              />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
              <label className="min-w-0 flex-1 sm:max-w-40">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Min price (KES)</span>
                <input
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  min="0"
                  max="99999999"
                  name="minPrice"
                  onChange={updateDraft}
                  step="0.01"
                  type="number"
                  value={draft.minPrice}
                />
              </label>
              <label className="min-w-0 flex-1 sm:max-w-40">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Max price (KES)</span>
                <input
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  min="0"
                  max="99999999"
                  name="maxPrice"
                  onChange={updateDraft}
                  step="0.01"
                  type="number"
                  value={draft.maxPrice}
                />
              </label>
              <label className="min-w-0 flex-1 sm:max-w-40">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Minimum rating</span>
                <select
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  name="minRating"
                  onChange={updateDraft}
                  value={draft.minRating}
                >
                  <option value="">Any rating</option>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>{rating}+ stars</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1 sm:max-w-56">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Available at</span>
                <input
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  name="availableAt"
                  onChange={updateDraft}
                  type="datetime-local"
                  value={draft.availableAt}
                />
              </label>
              <label className="min-w-0 flex-1 sm:max-w-48">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Sort by</span>
                <select
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  name="sort"
                  onChange={updateDraft}
                  value={draft.sort}
                >
                  <option value="newest">Recently added</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                </select>
              </label>
              <button
                className="min-h-10 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                type="submit"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      <section id="service-results" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Browse local services</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              {filters.category
                ? categories.find((category) => category.slug === filters.category)?.name || 'Service listings'
                : 'Popular services'}
            </h2>
            {!loading && !error && (
              <p className="mt-2 text-sm text-slate-600">
                {pagination.total} {pagination.total === 1 ? 'service' : 'services'} available
              </p>
            )}
          </div>
          {(filters.q || filters.category || filters.town || filters.area || filters.minPrice || filters.maxPrice || filters.minRating || filters.availableAt) && (
            <button
              className="text-sm font-semibold text-slate-600 underline decoration-stone-400 underline-offset-4 hover:text-slate-950"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>

        {categoriesError && (
          <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            Categories could not be loaded: {categoriesError}
          </p>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-800" role="alert">
            <p className="font-bold">Service listings are unavailable right now.</p>
            <p className="mt-1">{error} Check that the FundiConnect API is running and try again.</p>
          </div>
        )}
        {loading && (
          <p className="rounded-2xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-slate-600" role="status">
            Loading services…
          </p>
        )}
        {!loading && !error && services.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center">
            <h3 className="font-bold text-slate-900">No matching services yet</h3>
            <p className="mt-2 text-sm text-slate-600">Try another keyword, category, location, or price range.</p>
          </div>
        )}
        {!loading && !error && services.length > 0 && (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => <ServiceCard key={service.id} service={service} />)}
            </div>
            {pagination.totalPages > 1 && (
              <nav aria-label="Service results pages" className="mt-8 flex items-center justify-center gap-4">
                <button
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={pagination.page <= 1}
                  onClick={() => changePage(pagination.page - 1)}
                  type="button"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => changePage(pagination.page + 1)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      <section id="how-it-works" className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-3">
          {[
            ['01', 'Find a service', 'Search by trade, category, and the area where you need help.'],
            ['02', 'Compare providers', 'Review verified profiles, service details, and listed prices.'],
            ['03', 'Agree on the work', 'Contact a provider to discuss your job and confirm the details.'],
          ].map(([number, title, description]) => (
            <div key={number} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-800">
                {number}
              </span>
              <div>
                <h3 className="font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-slate-950 px-5 py-6 text-center text-sm text-slate-400">
        FundiConnect · Connecting Kenya with skilled local professionals
      </footer>
    </main>
  );
}
