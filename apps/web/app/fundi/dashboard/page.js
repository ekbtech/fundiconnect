'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, {
  DashboardTabs,
  InlineNotice,
  MetricCard,
  StatusBadge,
} from '../../components/DashboardShell.js';
import AccountDeletionRequest from '../../components/AccountDeletionRequest.js';
import NotificationPreferences from '../../components/NotificationPreferences.js';
import { apiRequest, formatKES, getApiUrl, roleDashboard } from '../../lib/api.js';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'jobs', label: 'Job requests' },
  { key: 'quotations', label: 'Quotation requests' },
  { key: 'services', label: 'My services' },
  { key: 'availability', label: 'Availability' },
  { key: 'profile', label: 'Profile & areas' },
  { key: 'notifications', label: 'Notifications' },
];

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const emptyService = {
  name: '',
  description: '',
  categoryId: '',
  pricingModel: 'fixed',
  price: '',
  estimatedDurationHours: '',
};

function Field({ label, ...props }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        {...props}
      />
    </label>
  );
}

function serviceAction(status) {
  if (status === 'requested' || status === 'confirmed') {
    return [['accepted', 'Accept'], ['rejected', 'Decline']];
  }
  if (status === 'accepted') {
    return [['in_progress', 'Start job']];
  }
  if (status === 'in_progress') {
    return [['completed', 'Mark complete']];
  }
  return [];
}

export default function FundiDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [quotationRequests, setQuotationRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileForm, setProfileForm] = useState({ businessName: '', bio: '', experienceYears: 0 });
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [areaForm, setAreaForm] = useState({ county: '', town: '', area: '' });
  const [availabilityForm, setAvailabilityForm] = useState([]);

  const loadDashboard = useCallback(async () => {
    const identity = await apiRequest('/auth/session');
    if (identity.user.role !== 'fundi') {
      router.replace(roleDashboard(identity.user.role));
      return;
    }
    const [result, categoryResult, quotationResult] = await Promise.all([
      apiRequest('/fundi/dashboard'),
      apiRequest('/services/categories'),
      apiRequest('/quotations/requests'),
    ]);
    setUser(identity.user);
    setDashboard(result);
    setCategories(categoryResult.categories);
    setQuotationRequests(quotationResult.requests);
    setAvailabilityForm(weekdays.map((_, weekday) => ({
      weekday,
      windows: result.availability
        .filter((slot) => slot.weekday === weekday)
        .map(({ startTime, endTime }) => ({ startTime, endTime })),
    })));
    setProfileForm({
      businessName: result.profile.businessName || '',
      bio: result.profile.bio || '',
      experienceYears: result.profile.experienceYears || 0,
    });
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .catch((loadError) => {
        if (!cancelled) {
          if (loadError.message.includes('Authentication required') || loadError.message.includes('invalid or expired')) {
            router.replace('/login?next=%2Ffundi%2Fdashboard');
          } else {
            setError(loadError.message);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadDashboard, router]);

  async function perform(action, message) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    await perform(
      () => apiRequest('/fundi/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          businessName: profileForm.businessName,
          bio: profileForm.bio,
          experienceYears: Number(profileForm.experienceYears),
        }),
      }),
      'Professional profile saved.',
    );
  }

  async function submitVerificationDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const saved = await perform(
      () => apiRequest('/fundi/verification-documents', {
        method: 'POST',
        body: formData,
      }),
      'Verification document submitted.',
    );
    if (saved) form.reset();
  }

  async function submitProfilePhoto(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const saved = await perform(
      () => apiRequest('/users/me/profile-photo', {
        method: 'POST',
        body: new FormData(form),
      }),
      'Profile photo updated.',
    );
    if (saved) form.reset();
  }

  async function saveService(event) {
    event.preventDefault();
    const body = {
      ...serviceForm,
      categoryId: Number(serviceForm.categoryId),
      price: serviceForm.pricingModel === 'quote' ? null : Number(serviceForm.price),
      estimatedDurationHours: serviceForm.estimatedDurationHours
        ? Number(serviceForm.estimatedDurationHours)
        : null,
    };
    const saved = await perform(
      () => apiRequest(
        editingServiceId ? `/fundi/services/${editingServiceId}` : '/fundi/services',
        { method: editingServiceId ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      ),
      editingServiceId ? 'Service updated.' : 'Service added.',
    );
    if (saved) {
      setServiceForm(emptyService);
      setEditingServiceId(null);
    }
  }

  async function saveArea(event) {
    event.preventDefault();
    const saved = await perform(
      () => apiRequest('/fundi/service-areas', {
        method: 'POST',
        body: JSON.stringify(areaForm),
      }),
      'Service area saved.',
    );
    if (saved) {
      setAreaForm({ county: '', town: '', area: '' });
    }
  }

  async function saveAvailability(event) {
    event.preventDefault();
    const availability = availabilityForm
      .flatMap(({ weekday, windows }) => windows.map(({ startTime, endTime }) => ({
        weekday,
        startTime,
        endTime,
      })));
    await perform(
      () => apiRequest('/fundi/availability', {
        method: 'PUT',
        body: JSON.stringify({ availability }),
      }),
      'Weekly availability saved.',
    );
  }

  async function submitQuotation(event, requestId) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = {
      requestId,
      estimatedPrice: Number(values.get('estimatedPrice')),
      scopeOfWork: values.get('scopeOfWork'),
      exclusions: values.get('exclusions') || null,
      validityDays: Number(values.get('validityDays')),
      proposedSchedule: values.get('proposedSchedule') || null,
    };
    const saved = await perform(
      () => apiRequest('/quotations/quote', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      'Quotation submitted to the customer.',
    );
    if (saved) form.reset();
  }

  async function updateJob(bookingId, status) {
    const reason = status === 'rejected' ? window.prompt('Why are you declining this job?') : '';
    if (status === 'rejected' && reason === null) {
      return;
    }
    const completionSummary = status === 'completed'
      ? window.prompt('Summarize the work completed (at least 10 characters).')
      : '';
    if (status === 'completed' && (completionSummary === null || completionSummary.trim().length < 10)) {
      if (completionSummary !== null) {
        window.alert('Enter a completion summary of at least 10 characters.');
      }
      return;
    }
    await perform(
      () => apiRequest(`/fundi/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
          ...(status === 'completed' ? { completionSummary: completionSummary.trim() } : {}),
        }),
      }),
      'Job status updated.',
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading fundi workspace…</main>;
  }
  if (!user || !dashboard) {
    return (
      <main className="min-h-screen bg-stone-100 p-8">
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 text-sm text-red-800" role="alert">
          {error || 'Could not load your fundi workspace.'}
          <p className="mt-3"><a className="font-semibold underline" href="/login">Sign in again</a></p>
        </div>
      </main>
    );
  }

  return (
    <DashboardShell role="fundi" user={user}>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Fundi workspace</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Good to see you, {user.firstName}.</h1>
        <p className="mt-2 text-sm text-slate-600">Manage your work, listings, and professional profile.</p>
      </div>
      <InlineNotice error={error} success={success} />
      <DashboardTabs items={tabs} selected={tab} onSelect={setTab} />

      {tab === 'overview' && (
        <>
          <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Provider verification</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {dashboard.profile.isVerified
                    ? 'Your profile is approved and eligible to appear in public search.'
                    : 'Complete your profile and wait for an administrator to review your details.'}
                </p>
              </div>
              <StatusBadge status={dashboard.profile.verificationStatus} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="New job requests" value={dashboard.stats.pendingJobs} />
            <MetricCard label="Active jobs" value={dashboard.stats.activeJobs} />
            <MetricCard label="Completed jobs" value={dashboard.stats.completedJobs} />
            <MetricCard label="Completed job value" value={formatKES(dashboard.stats.completedJobValue)} detail="Not a payment or payout balance" />
          </div>
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold">Upcoming and recent work</h2>
            <JobList bookings={dashboard.bookings.slice(0, 5)} onUpdate={updateJob} saving={saving} />
          </section>
        </>
      )}

      {tab === 'jobs' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Job requests and workload</h2>
          <JobList bookings={dashboard.bookings} onUpdate={updateJob} saving={saving} />
        </section>
      )}

      {tab === 'quotations' && (
        <section>
          <h2 className="mb-2 text-xl font-bold">Customer quotation requests</h2>
          <p className="mb-4 text-sm text-slate-600">
            Review the requested work and submit a priced scope. Customers choose whether to accept; accepting creates a booking request.
          </p>
          {quotationRequests.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-slate-600">
              No quotation requests yet. Requests for your services will appear here.
            </div>
          ) : (
            <div className="space-y-4">
              {quotationRequests.map((request) => {
                const activeQuotation = request.quotations.find(
                  (quotation) => quotation.status === 'pending' || quotation.status === 'accepted',
                );
                const canQuote = !activeQuotation && ['requested', 'quoted'].includes(request.status);
                return (
                  <article className="rounded-2xl border border-stone-200 bg-white p-5" key={request.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{request.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.service?.name} · {request.customer?.firstName} {request.customer?.lastName}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.description}</p>
                    {request.photos?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {request.photos.map((photo) => (
                          <a
                            className="text-sm font-semibold text-amber-800 underline"
                            href={`${getApiUrl()}${photo.url}`}
                            key={photo.id}
                            rel="noreferrer"
                            target="_blank"
                          >
                            View job photo
                          </a>
                        ))}
                      </div>
                    )}
                    {request.quotations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {request.quotations.map((quotation) => (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm" key={quotation.id}>
                            <span>
                              {formatKES(quotation.estimatedPrice)} · {quotation.scopeOfWork}
                            </span>
                            <StatusBadge status={quotation.status} />
                          </div>
                        ))}
                      </div>
                    )}
                    {canQuote && (
                      <form
                        className="mt-5 grid gap-3 border-t border-stone-200 pt-4 md:grid-cols-2"
                        onSubmit={(event) => submitQuotation(event, request.id)}
                      >
                        <Field
                          label="Estimated price (KES)"
                          max="99999999"
                          min="0.01"
                          name="estimatedPrice"
                          required
                          step="0.01"
                          type="number"
                        />
                        <Field
                          label="Quote validity (days)"
                          defaultValue="7"
                          max="365"
                          min="1"
                          name="validityDays"
                          required
                          type="number"
                        />
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-slate-700">
                            Scope of work
                            <textarea
                              className="mt-1.5 min-h-24 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                              maxLength={5000}
                              minLength={1}
                              name="scopeOfWork"
                              required
                            />
                          </label>
                        </div>
                        <Field label="Exclusions (optional)" maxLength={5000} name="exclusions" />
                        <Field label="Proposed schedule (optional)" maxLength={255} name="proposedSchedule" />
                        <div className="md:col-span-2">
                          <button
                            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                            disabled={saving}
                            type="submit"
                          >
                            {saving ? 'Submitting…' : 'Submit quotation'}
                          </button>
                        </div>
                      </form>
                    )}
                    {!canQuote && !activeQuotation && request.status !== 'approved' && (
                      <p className="mt-4 text-sm text-slate-500">This quotation request is no longer accepting offers.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'services' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">{editingServiceId ? 'Edit service' : 'Add a service'}</h2>
            <form className="mt-5 space-y-4" onSubmit={saveService}>
              <Field label="Service name" maxLength={200} minLength={2} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} required value={serviceForm.name} />
              <label className="block text-sm font-semibold text-slate-700">
                Category
                <select
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                  onChange={(event) => setServiceForm({ ...serviceForm, categoryId: event.target.value })}
                  required
                  value={serviceForm.categoryId}
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Description
                <textarea
                  className="mt-1.5 min-h-28 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                  maxLength={5000}
                  minLength={10}
                  onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })}
                  required
                  value={serviceForm.description}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Pricing model
                <select
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                  onChange={(event) => setServiceForm({
                    ...serviceForm,
                    pricingModel: event.target.value,
                    price: event.target.value === 'quote' ? '' : serviceForm.price,
                  })}
                  value={serviceForm.pricingModel}
                >
                  <option value="fixed">Fixed price</option>
                  <option value="starting_price">Starting price</option>
                  <option value="quote">Quote required</option>
                </select>
              </label>
              {serviceForm.pricingModel !== 'quote' && (
                <Field label="Price (KES)" max="99999999" min="0" onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} required step="0.01" type="number" value={serviceForm.price} />
              )}
              <Field label="Estimated duration (hours, optional)" max="10000" min="1" onChange={(event) => setServiceForm({ ...serviceForm, estimatedDurationHours: event.target.value })} type="number" value={serviceForm.estimatedDurationHours} />
              <div className="flex gap-3">
                <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
                  {saving ? 'Saving…' : editingServiceId ? 'Save changes' : 'Add service'}
                </button>
                {editingServiceId && (
                  <button className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold" onClick={() => { setServiceForm(emptyService); setEditingServiceId(null); }} type="button">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-bold">Your listings</h2>
            {dashboard.services.length === 0 && <EmptyState message="You have not added any services yet." />}
            <div className="space-y-3">
              {dashboard.services.map((service) => (
                <article className="rounded-2xl border border-stone-200 bg-white p-5" key={service.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{service.name}</h3>
                        <StatusBadge status={service.isActive ? 'approved' : 'cancelled'} />
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{service.categoryName} · {service.price === null ? 'Quote required' : formatKES(service.price)}</p>
                      <p className="mt-2 text-sm text-slate-600">{service.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"
                        onClick={() => {
                          setServiceForm({
                            name: service.name,
                            description: service.description,
                            categoryId: String(categories.find((category) => category.name === service.categoryName)?.id || ''),
                            pricingModel: service.pricingModel,
                            price: service.price === null ? '' : String(service.price),
                            estimatedDurationHours: service.estimatedDurationHours ? String(service.estimatedDurationHours) : '',
                          });
                          setEditingServiceId(service.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      {service.isActive && (
                        <button
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          disabled={saving}
                          onClick={() => perform(
                            () => apiRequest(`/fundi/services/${service.id}`, { method: 'DELETE' }),
                            'Service listing deactivated.',
                          )}
                          type="button"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'profile' && (
        <>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-bold">Professional profile</h2>
            <form className="mt-5 space-y-4" onSubmit={saveProfile}>
              <Field label="Business or professional name" maxLength={255} onChange={(event) => setProfileForm({ ...profileForm, businessName: event.target.value })} value={profileForm.businessName} />
              <Field label="Years of experience" max="80" min="0" onChange={(event) => setProfileForm({ ...profileForm, experienceYears: event.target.value })} type="number" value={profileForm.experienceYears} />
              <label className="block text-sm font-semibold text-slate-700">
                About your work
                <textarea
                  className="mt-1.5 min-h-36 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                  maxLength={5000}
                  onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })}
                  value={profileForm.bio}
                />
              </label>
              <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </form>
            <div className="mt-8 border-t border-stone-200 pt-6">
              <h3 className="font-bold">Profile photo</h3>
              <p className="mt-1 text-sm text-slate-600">Upload a JPEG or PNG image up to 5 MB. It is shown on your public provider profile.</p>
              {user.profilePhoto && (
                <img
                  alt={`${user.firstName} ${user.lastName}`}
                  className="mt-3 h-20 w-20 rounded-full object-cover"
                  src={`${getApiUrl()}${user.profilePhoto}`}
                />
              )}
              <form className="mt-3 space-y-3" onSubmit={submitProfilePhoto}>
                <input
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  className="block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
                  name="photo"
                  required
                  type="file"
                />
                <button className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={saving} type="submit">
                  {saving ? 'Uploading…' : 'Upload profile photo'}
                </button>
              </form>
            </div>
            <div className="mt-8 border-t border-stone-200 pt-6">
              <h3 className="font-bold">Verification evidence</h3>
              <p className="mt-1 text-sm text-slate-600">
                Upload identity or qualification evidence for administrator review. Files are private and limited to PDF, JPEG, or PNG up to 5 MB.
              </p>
              <form className="mt-4 space-y-3" onSubmit={submitVerificationDocument}>
                <label className="block text-sm font-semibold text-slate-700">
                  Document type
                  <select
                    className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                    name="documentType"
                    required
                  >
                    <option value="identity">Identity document</option>
                    <option value="qualification">Qualification or trade certificate</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Choose a file
                  <input
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-normal"
                    name="document"
                    required
                    type="file"
                  />
                </label>
                <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
                  {saving ? 'Uploading…' : 'Submit for review'}
                </button>
              </form>
              {dashboard.verificationDocuments.length > 0 && (
                <ul className="mt-5 space-y-2">
                  {dashboard.verificationDocuments.map((document) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm" key={document.id}>
                      <span>{document.originalFilename} · {document.documentType === 'identity' ? 'Identity' : 'Qualification'} · {(document.sizeBytes / 1024).toFixed(0)} KB · Submitted {new Date(document.uploadedAt).toLocaleDateString()}</span>
                      <a
                        className="font-semibold text-amber-800 underline"
                        href={`${getApiUrl()}/fundi/verification-documents/${document.id}/file`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Download my document
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section>
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="text-xl font-bold">Service areas</h2>
              <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={saveArea}>
                <Field label="County" maxLength={100} onChange={(event) => setAreaForm({ ...areaForm, county: event.target.value })} required value={areaForm.county} />
                <Field label="Town" maxLength={100} onChange={(event) => setAreaForm({ ...areaForm, town: event.target.value })} required value={areaForm.town} />
                <Field label="Area or neighbourhood (optional)" maxLength={150} onChange={(event) => setAreaForm({ ...areaForm, area: event.target.value })} value={areaForm.area} />
                <div className="flex items-end">
                  <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
                    Add service area
                  </button>
                </div>
              </form>
              <ul className="mt-5 divide-y divide-stone-100">
                {dashboard.serviceAreas.map((location) => (
                  <li className="flex items-center justify-between gap-3 py-3 text-sm" key={location.id}>
                    <span>{[location.area, location.town, location.county].filter(Boolean).join(', ')}</span>
                    <button
                      aria-label={`Remove ${location.area || location.town} service area`}
                      className="text-xs font-semibold text-red-700 hover:underline"
                      disabled={saving}
                      onClick={() => perform(
                        () => apiRequest(`/fundi/service-areas/${location.id}`, { method: 'DELETE' }),
                        'Service area removed.',
                      )}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {dashboard.serviceAreas.length === 0 && <p className="mt-4 text-sm text-slate-500">Add the towns and areas where you work.</p>}
            </div>
          </section>
        </div>
        <AccountDeletionRequest />
        </>
      )}

      {tab === 'notifications' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Notifications</h2>
          <NotificationPreferences />
        </section>
      )}

      {tab === 'availability' && (
        <section className="max-w-3xl rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-bold">Weekly appointment availability</h2>
          <p className="mt-2 text-sm text-slate-600">
            Set one or more working windows per day in East Africa Time. Windows on the same day cannot overlap. Booking requests outside these hours or overlapping existing work will be declined by the system.
          </p>
          <form className="mt-5 space-y-3" onSubmit={saveAvailability}>
            {availabilityForm.map((day) => (
              <fieldset className="rounded-xl border border-stone-200 p-3" key={day.weekday}>
                <legend className="px-1 text-sm font-semibold">{weekdays[day.weekday]}</legend>
                <div className="space-y-2">
                  {day.windows.map((window, windowIndex) => (
                    <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" key={`${day.weekday}-${windowIndex}`}>
                      <label className="text-xs font-semibold text-slate-600">
                        Start
                        <input
                          className="mt-1 block rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                          onChange={(event) => setAvailabilityForm((current) => current.map((item) => (
                            item.weekday === day.weekday
                              ? {
                                  ...item,
                                  windows: item.windows.map((entry, index) => (
                                    index === windowIndex ? { ...entry, startTime: event.target.value } : entry
                                  )),
                                }
                              : item
                          )))}
                          required
                          type="time"
                          value={window.startTime}
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        End
                        <input
                          className="mt-1 block rounded-lg border border-stone-300 px-2 py-1.5 text-sm font-normal"
                          onChange={(event) => setAvailabilityForm((current) => current.map((item) => (
                            item.weekday === day.weekday
                              ? {
                                  ...item,
                                  windows: item.windows.map((entry, index) => (
                                    index === windowIndex ? { ...entry, endTime: event.target.value } : entry
                                  )),
                                }
                              : item
                          )))}
                          required
                          type="time"
                          value={window.endTime}
                        />
                      </label>
                      <button
                        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
                        onClick={() => setAvailabilityForm((current) => current.map((item) => (
                          item.weekday === day.weekday
                            ? { ...item, windows: item.windows.filter((_, index) => index !== windowIndex) }
                            : item
                        )))}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-3 rounded-lg border border-amber-700 px-3 py-1.5 text-sm font-semibold text-amber-800"
                  onClick={() => setAvailabilityForm((current) => current.map((item) => (
                    item.weekday === day.weekday
                      ? { ...item, windows: [...item.windows, { startTime: '09:00', endTime: '17:00' }] }
                      : item
                  )))}
                  type="button"
                >
                  Add time window
                </button>
              </fieldset>
            ))}
            <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">
              {saving ? 'Saving…' : 'Save availability'}
            </button>
          </form>
        </section>
      )}
    </DashboardShell>
  );
}

function JobList({ bookings, onUpdate, saving }) {
  if (bookings.length === 0) {
    return <EmptyState message="No job requests yet. They will appear here when a customer books one of your services." />;
  }
  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <article className="rounded-2xl border border-stone-200 bg-white p-5" key={booking.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{booking.serviceName}</h3>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{booking.reference}</p>
            </div>
            {booking.agreedPrice !== null && <p className="font-bold">{formatKES(booking.agreedPrice)}</p>}
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p><span className="font-semibold text-slate-800">Customer:</span> {booking.customerName}</p>
            <p><span className="font-semibold text-slate-800">Appointment:</span> {new Date(booking.requestedAt).toLocaleString()}</p>
            <p><span className="font-semibold text-slate-800">Location:</span> {booking.location}</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{booking.description}</p>
          {booking.completionSummary && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="font-semibold">Completion summary</p>
              <p className="mt-1">{booking.completionSummary}</p>
              {booking.completionConfirmedAt && <p className="mt-1 text-xs">Customer confirmed {new Date(booking.completionConfirmedAt).toLocaleString()}.</p>}
            </div>
          )}
          {serviceAction(booking.status).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {serviceAction(booking.status).map(([status, label]) => (
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                    status === 'rejected'
                      ? 'border border-red-200 text-red-700 hover:bg-red-50'
                      : 'bg-slate-900 text-white hover:bg-slate-700'
                  }`}
                  disabled={saving}
                  key={status}
                  onClick={() => onUpdate(booking.id, status)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return <p className="rounded-2xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-slate-600">{message}</p>;
}
