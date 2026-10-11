'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardShell, {
  DashboardTabs,
  InlineNotice,
  MetricCard,
  StatusBadge,
} from '../../components/DashboardShell.js';
import NotificationPreferences from '../../components/NotificationPreferences.js';
import { apiRequest, formatKES, getApiUrl, roleDashboard } from '../../lib/api.js';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'payments', label: 'Payments' },
  { key: 'feedback', label: 'Reviews & complaints' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'account', label: 'Account' },
];

function CustomerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedServiceId = searchParams.get('serviceId') || '';
  const requestedIntent = searchParams.get('intent') || '';
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [payments, setPayments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [tab, setTab] = useState('overview');
  const [mode, setMode] = useState(requestedIntent === 'quote' ? 'quote' : 'booking');
  const [serviceId, setServiceId] = useState(requestedServiceId);
  const [bookingForm, setBookingForm] = useState({ requestedAt: '', location: '', jobDescription: '' });
  const [quoteForm, setQuoteForm] = useState({ title: '', description: '' });
  const [paymentForm, setPaymentForm] = useState({ bookingId: '', paymentMethod: 'cash', amount: '', transactionReference: '' });
  const [reviewForm, setReviewForm] = useState({ bookingId: '', rating: '5', comment: '' });
  const [complaintForm, setComplaintForm] = useState({ bookingId: '', subject: '', description: '' });
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDashboard = useCallback(async () => {
    const identity = await apiRequest('/auth/session');
    if (identity.user.role !== 'customer') {
      router.replace(roleDashboard(identity.user.role));
      return;
    }
    const [
      serviceResult,
      bookingResult,
      requestResult,
      paymentResult,
      complaintResult,
      notificationResult,
    ] =
      await Promise.all([
        apiRequest('/services?pageSize=50'),
        apiRequest('/bookings'),
        apiRequest('/quotations/requests'),
        apiRequest('/payments'),
        apiRequest('/reviews/complaints'),
        apiRequest('/notifications'),
      ]);
    setUser(identity.user);
    setProfileForm({ firstName: identity.user.firstName, lastName: identity.user.lastName });
    setServices(serviceResult.services);
    setBookings(bookingResult.bookings);
    setRequests(requestResult.requests);
    setPayments(paymentResult.payments);
    setComplaints(complaintResult.complaints);
    setNotifications(notificationResult.notifications);
    setServiceId((current) => current || requestedServiceId);
  }, [requestedServiceId, router]);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .catch((loadError) => {
        if (cancelled) return;
        if (
          loadError.message.includes('Authentication required') ||
          loadError.message.includes('invalid or expired')
        ) {
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        } else {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadDashboard, router]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) || null,
    [serviceId, services],
  );
  const reviewableBookings = bookings.filter(
    (booking) => booking.status === 'closed' && !booking.isReviewed,
  );
  const activeBookings = bookings.filter(
    (booking) => !['completed', 'closed', 'cancelled', 'rejected', 'expired'].includes(booking.status),
  );

  async function perform(action, message) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await action();
      await loadDashboard();
      setSuccess(result?.message || message);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedService) {
      setError('Choose a service before continuing.');
      return;
    }
    if (mode === 'quote') {
      const formData = new FormData(form);
      formData.set('serviceId', String(Number(serviceId)));
      const saved = await perform(
        () => apiRequest('/quotations/requests', {
          method: 'POST',
          body: formData,
        }),
        'Quotation request sent.',
      );
      if (saved) {
        setQuoteForm({ title: '', description: '' });
        form.reset();
      }
      return;
    }
    const saved = await perform(
      () => apiRequest('/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...bookingForm, serviceId: Number(serviceId) }),
      }),
      'Booking request sent.',
    );
    if (saved) setBookingForm({ requestedAt: '', location: '', jobDescription: '' });
  }

  async function respondToQuote(event, quoteId, decision) {
    event.preventDefault();
    const payload = { status: decision };
    if (decision === 'accepted') {
      const formData = new FormData(event.currentTarget);
      payload.requestedAt = formData.get('requestedAt');
      payload.location = formData.get('location');
      payload.jobDescription = formData.get('jobDescription');
    }
    await perform(
      () => apiRequest(`/quotations/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
      decision === 'accepted' ? 'Quotation accepted and booking created.' : 'Quotation declined.',
    );
  }

  async function recordPayment(event) {
    event.preventDefault();
    const saved = await perform(
      () => apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...paymentForm,
          bookingId: Number(paymentForm.bookingId),
          amount: Number(paymentForm.amount),
          currency: 'KES',
        }),
      }),
      'Payment record added as pending.',
    );
    if (saved) setPaymentForm({ bookingId: '', paymentMethod: 'cash', amount: '', transactionReference: '' });
  }

  async function submitReview(event) {
    event.preventDefault();
    const saved = await perform(
      () => apiRequest('/reviews', {
        method: 'POST',
        body: JSON.stringify({ ...reviewForm, bookingId: Number(reviewForm.bookingId), rating: Number(reviewForm.rating) }),
      }),
      'Review submitted.',
    );
    if (saved) setReviewForm({ bookingId: '', rating: '5', comment: '' });
  }

  async function submitComplaint(event) {
    event.preventDefault();
    const saved = await perform(
      () => apiRequest('/reviews/complaints', {
        method: 'POST',
        body: JSON.stringify({ ...complaintForm, bookingId: Number(complaintForm.bookingId) }),
      }),
      'Complaint submitted.',
    );
    if (saved) setComplaintForm({ bookingId: '', subject: '', description: '' });
  }

  async function markNotificationRead(notificationId) {
    await perform(
      () => apiRequest(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
      'Notification marked as read.',
    );
  }

  async function saveProfile(event) {
    event.preventDefault();
    await perform(
      () => apiRequest('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      }),
      'Profile updated.',
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading customer workspace…</main>;
  }
  if (!user) {
    return (
      <main className="min-h-screen bg-stone-100 p-8">
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 text-sm text-red-800" role="alert">
          {error || 'Could not load your customer workspace.'}
          <p className="mt-3"><a className="font-semibold underline" href="/login">Sign in again</a></p>
        </div>
      </main>
    );
  }

  return (
    <DashboardShell role="customer" user={user}>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Customer workspace</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Welcome, {user.firstName}.</h1>
        <p className="mt-2 text-sm text-slate-600">Manage service requests, appointments, payments, and feedback.</p>
      </div>
      <InlineNotice error={error} success={success} />
      <DashboardTabs items={tabs} selected={tab} onSelect={setTab} />

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Active bookings" value={activeBookings.length} />
            <MetricCard label="Quotation requests" value={requests.length} />
            <MetricCard label="Payment records" value={payments.length} detail="Payment records are not payment processing." />
            <MetricCard label="Unread notifications" value={notifications.filter((item) => !item.isRead).length} />
          </div>
          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="font-bold">Upcoming work</h2>
              <div className="mt-4 space-y-3">
                {activeBookings.slice(0, 4).map((booking) => <BookingCard booking={booking} key={booking.id} />)}
                {activeBookings.length === 0 && <EmptyState message="You do not have any active bookings." />}
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="font-bold">Latest notifications</h2>
              <NotificationList notifications={notifications.slice(0, 5)} onRead={markNotificationRead} saving={saving} />
            </div>
          </section>
          <p className="mt-6 text-sm text-slate-600">
            <a className="font-semibold text-amber-800 underline" href="/">Browse all services</a>
          </p>
        </>
      )}

      {tab === 'bookings' && (
        <section>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5" onSubmit={submitRequest}>
              <div>
                <h2 className="text-xl font-bold">Request a service</h2>
                <p className="mt-1 text-sm text-slate-600">A booking starts as a request for the provider to confirm.</p>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Service
                <select
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                  onChange={(event) => setServiceId(event.target.value)}
                  required
                  value={serviceId}
                >
                  <option value="">Choose a service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.provider.businessName || `${service.provider.firstName} ${service.provider.lastName}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Request type
                <select
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                  onChange={(event) => setMode(event.target.value)}
                  value={selectedService?.pricingModel === 'quote' ? 'quote' : mode}
                >
                  <option value="booking" disabled={selectedService?.pricingModel === 'quote'}>Appointment booking</option>
                  <option value="quote">Request a quotation</option>
                </select>
              </label>
              {mode === 'quote' || selectedService?.pricingModel === 'quote' ? (
                <>
                  <TextField label="Job title" maxLength={200} minLength={2} onChange={(event) => setQuoteForm({ ...quoteForm, title: event.target.value })} required value={quoteForm.title} />
                  <TextArea label="Describe the work needed" maxLength={5000} minLength={10} onChange={(event) => setQuoteForm({ ...quoteForm, description: event.target.value })} required value={quoteForm.description} />
                  <label className="block text-sm font-semibold text-slate-700">
                    Job photos (optional, up to 4 JPEG or PNG images, 5 MB each)
                    <input
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-normal"
                      multiple
                      name="photos"
                      type="file"
                    />
                  </label>
                </>
              ) : (
                <>
                  <TextField label="Appointment time" onChange={(event) => setBookingForm({ ...bookingForm, requestedAt: event.target.value })} required type="datetime-local" value={bookingForm.requestedAt} />
                  <TextField label="Service location" maxLength={255} onChange={(event) => setBookingForm({ ...bookingForm, location: event.target.value })} required value={bookingForm.location} />
                  <TextArea label="Describe the work needed" maxLength={5000} minLength={10} onChange={(event) => setBookingForm({ ...bookingForm, jobDescription: event.target.value })} required value={bookingForm.jobDescription} />
                </>
              )}
              <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving || services.length === 0} type="submit">
                {saving ? 'Sending…' : mode === 'quote' || selectedService?.pricingModel === 'quote' ? 'Send quotation request' : 'Request booking'}
              </button>
            </form>
            <div>
              <h2 className="mb-4 text-xl font-bold">Your bookings</h2>
              {bookings.length === 0 ? <EmptyState message="Your appointments will appear here." /> : (
                <div className="space-y-3">{bookings.map((booking) => (
                  <BookingCard
                    booking={booking}
                    key={booking.id}
                    onConfirmCompletion={() => {
                      if (!window.confirm('Confirm that this job has been completed?')) return;
                      perform(
                        () => apiRequest(`/bookings/${booking.id}/confirm-completion`, {
                          method: 'PATCH',
                        }),
                        'Job completion confirmed.',
                      );
                    }}
                    onCancel={(reason) => perform(
                      () => apiRequest(`/bookings/${booking.id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'cancelled', reason }),
                      }),
                      'Booking cancelled.',
                    )}
                    onReschedule={(requestedAt, reason) => perform(
                      () => apiRequest(`/bookings/${booking.id}/schedule`, {
                        method: 'PATCH',
                        body: JSON.stringify({ requestedAt, reason }),
                      }),
                      'Booking rescheduled.',
                    )}
                    saving={saving}
                  />
                ))}</div>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'quotations' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Quotation requests and offers</h2>
          {requests.length === 0 ? <EmptyState message="You have not requested any quotations yet." /> : (
            <div className="space-y-4">
              {requests.map((request) => (
                <article className="rounded-2xl border border-stone-200 bg-white p-5" key={request.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{request.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{request.service?.name} · {request.provider?.businessName || 'Service provider'}</p>
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
                  {request.quotations.map((quote) => (
                    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4" key={quote.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold">{formatKES(quote.estimatedPrice)} · {quote.provider?.businessName || 'Provider offer'}</p>
                        <StatusBadge status={quote.status} />
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quote.scopeOfWork}</p>
                      {quote.exclusions && <p className="mt-2 text-sm text-slate-600"><strong>Exclusions:</strong> {quote.exclusions}</p>}
                      <p className="mt-2 text-xs text-slate-500">
                        Valid {quote.validityDays} days
                        {quote.expiresAt ? ` · Expires ${new Date(quote.expiresAt).toLocaleString()}` : ''}
                        {quote.proposedSchedule ? ` · Suggested schedule: ${quote.proposedSchedule}` : ''}
                      </p>
                      {quote.status === 'pending' && (
                        <form className="mt-4 grid gap-3 border-t border-stone-200 pt-4 md:grid-cols-2" onSubmit={(event) => respondToQuote(event, quote.id, 'accepted')}>
                          <p className="text-sm font-semibold md:col-span-2">Accepting creates a booking using this quoted amount. Choose an appointment time:</p>
                          <TextField label="Appointment time" name="requestedAt" required type="datetime-local" />
                          <TextField label="Service location" maxLength={255} name="location" required />
                          <div className="md:col-span-2">
                            <TextArea label="Job description / agreed details" maxLength={5000} minLength={10} name="jobDescription" required />
                          </div>
                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">Accept & create booking</button>
                            <button
                              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                              disabled={saving}
                              onClick={(event) => {
                                event.preventDefault();
                                if (window.confirm('Decline this quotation?')) {
                                  perform(
                                    () => apiRequest(`/quotations/quotes/${quote.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: 'rejected' }),
                                    }),
                                    'Quotation declined.',
                                  );
                                }
                              }}
                              type="button"
                            >
                              Decline
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                  {request.quotations.length === 0 && <p className="mt-4 text-sm text-slate-500">Waiting for a provider quotation.</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'payments' && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5" onSubmit={recordPayment}>
            <h2 className="text-xl font-bold">Record a payment</h2>
            <p className="text-sm text-slate-600">This records a pending payment entry only; it does not transfer or verify funds.</p>
            <label className="block text-sm font-semibold text-slate-700">
              Booking
              <select
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal"
                onChange={(event) => {
                  const booking = bookings.find((item) => item.id === event.target.value);
                  setPaymentForm({ ...paymentForm, bookingId: event.target.value, amount: booking?.agreedPrice ? String(booking.agreedPrice) : paymentForm.amount });
                }}
                required
                value={paymentForm.bookingId}
              >
                <option value="">Choose a booking</option>
                {bookings.filter((booking) => booking.agreedPrice > 0).map((booking) => (
                  <option key={booking.id} value={booking.id}>{booking.bookingReference} · {booking.service.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Payment method
              <select className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal" onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })} value={paymentForm.paymentMethod}>
                <option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option>
              </select>
            </label>
            <TextField label="Amount (KES)" max="99999999" min="0.01" onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} required step="0.01" type="number" value={paymentForm.amount} />
            <TextField label="Transaction reference (optional)" maxLength={150} onChange={(event) => setPaymentForm({ ...paymentForm, transactionReference: event.target.value })} value={paymentForm.transactionReference} />
            <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">Record pending payment</button>
          </form>
          <div>
            <h2 className="mb-4 text-xl font-bold">Payment history</h2>
            {payments.length === 0 ? <EmptyState message="No payment records yet." /> : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4" key={payment.id}>
                    <div><p className="font-semibold">{payment.bookingReference} · {formatKES(payment.amount)}</p><p className="mt-1 text-xs capitalize text-slate-500">{payment.paymentMethod.replaceAll('_', ' ')} · {payment.transactionReference || 'No transaction reference'}</p></div>
                    <StatusBadge status={payment.status} />
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'feedback' && (
        <section className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5" onSubmit={submitReview}>
            <h2 className="text-xl font-bold">Review completed work</h2>
            <label className="block text-sm font-semibold text-slate-700">
              Completed booking
              <select className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal" onChange={(event) => setReviewForm({ ...reviewForm, bookingId: event.target.value })} required value={reviewForm.bookingId}>
                <option value="">Choose a completed booking</option>
                {reviewableBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.bookingReference} · {booking.service.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Rating
              <select className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal" onChange={(event) => setReviewForm({ ...reviewForm, rating: event.target.value })} value={reviewForm.rating}>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
              </select>
            </label>
            <TextArea label="Your review (optional)" maxLength={2000} onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })} value={reviewForm.comment} />
            <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving || reviewableBookings.length === 0} type="submit">Submit review</button>
          </form>
          <form className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5" onSubmit={submitComplaint}>
            <h2 className="text-xl font-bold">Report an issue</h2>
            <label className="block text-sm font-semibold text-slate-700">
              Booking
              <select className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal" onChange={(event) => setComplaintForm({ ...complaintForm, bookingId: event.target.value })} required value={complaintForm.bookingId}>
                <option value="">Choose a booking</option>
                {bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.bookingReference} · {booking.service.name}</option>)}
              </select>
            </label>
            <TextField label="Subject" maxLength={200} minLength={3} onChange={(event) => setComplaintForm({ ...complaintForm, subject: event.target.value })} required value={complaintForm.subject} />
            <TextArea label="Describe the issue" maxLength={5000} minLength={10} onChange={(event) => setComplaintForm({ ...complaintForm, description: event.target.value })} required value={complaintForm.description} />
            <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving || bookings.length === 0} type="submit">Submit complaint</button>
          </form>
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-xl font-bold">Your complaints</h2>
            {complaints.length === 0 ? <EmptyState message="No complaints have been submitted." /> : (
              <div className="space-y-3">{complaints.map((complaint) => (
                <article className="rounded-xl border border-stone-200 bg-white p-4" key={complaint.id}>
                  <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{complaint.subject}</h3><StatusBadge status={complaint.status} /></div>
                  <p className="mt-2 text-sm text-slate-600">{complaint.description}</p>
                  <p className="mt-2 text-xs text-slate-500">Booking {complaint.bookingReference}</p>
                </article>
              ))}</div>
            )}
          </div>
        </section>
      )}

      {tab === 'notifications' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Notifications</h2>
          <NotificationPreferences />
          <NotificationList notifications={notifications} onRead={markNotificationRead} saving={saving} />
        </section>
      )}

      {tab === 'account' && (
        <section className="max-w-xl rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-bold">Your profile</h2>
          <p className="text-sm text-slate-600">{user.email} · Customer</p>
          {user.profilePhoto && (
            <img
              alt={`${user.firstName} ${user.lastName}`}
              className="mt-4 h-20 w-20 rounded-full object-cover"
              src={`${getApiUrl()}${user.profilePhoto}`}
            />
          )}
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
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
            }}
          >
            <label className="block text-sm font-semibold text-slate-700">
              Profile photo (JPEG or PNG, up to 5 MB)
              <input
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-normal"
                name="photo"
                required
                type="file"
              />
            </label>
            <button className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50" disabled={saving} type="submit">
              {saving ? 'Uploading…' : 'Upload photo'}
            </button>
          </form>
          <form className="mt-6 space-y-4 border-t border-stone-200 pt-5" onSubmit={saveProfile}>
            <TextField label="First name" maxLength={100} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} required value={profileForm.firstName} />
            <TextField label="Last name" maxLength={100} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} required value={profileForm.lastName} />
            <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={saving} type="submit">Save profile</button>
          </form>
        </section>
      )}
    </DashboardShell>
  );
}

export default function CustomerDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading customer workspace…</main>}>
      <CustomerDashboard />
    </Suspense>
  );
}

function BookingCard({ booking, onCancel, onReschedule, onConfirmCompletion, saving }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const canReschedule = ['requested', 'confirmed', 'accepted'].includes(booking.status);

  async function loadHistory() {
    setHistoryError('');
    try {
      setHistory(await apiRequest(`/bookings/${booking.id}/history`));
    } catch (loadError) {
      setHistoryError(loadError.message);
    }
  }

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{booking.service.name} · {booking.bookingReference}</h3>
        <StatusBadge status={booking.status} />
      </div>
      <p className="mt-2 text-sm text-slate-600">{booking.provider.businessName || `${booking.provider.user.firstName} ${booking.provider.user.lastName}`}</p>
      <p className="mt-1 text-sm text-slate-600">{new Date(booking.requestedAt).toLocaleString()} · {booking.location}</p>
      <p className="mt-2 text-sm text-slate-700">{booking.jobDescription}</p>
      {booking.agreedPrice !== null && <p className="mt-2 text-sm font-bold">{formatKES(booking.agreedPrice)}</p>}
      {booking.completionSummary && (
        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-semibold">Provider completion summary</p>
          <p className="mt-1">{booking.completionSummary}</p>
        </div>
      )}
      {booking.status === 'completed' && onConfirmCompletion && (
        <button
          className="mt-4 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onClick={onConfirmCompletion}
          type="button"
        >
          Confirm job completion
        </button>
      )}
      {onCancel && canReschedule && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
          <button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold" onClick={() => setShowScheduleForm((current) => !current)} type="button">
            {showScheduleForm ? 'Close reschedule form' : 'Reschedule'}
          </button>
          <button
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              const reason = window.prompt('Why are you cancelling this booking?');
              if (reason && reason.trim().length >= 3) onCancel(reason.trim());
              else if (reason !== null) window.alert('Enter a cancellation reason of at least 3 characters.');
            }}
            type="button"
          >
            Cancel booking
          </button>
        </div>
      )}
      {showScheduleForm && onReschedule && (
        <form
          className="mt-3 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onReschedule(formData.get('requestedAt'), formData.get('reason'));
            setShowScheduleForm(false);
          }}
        >
          <label className="text-xs font-semibold text-slate-600">New appointment time
            <input className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal" name="requestedAt" required type="datetime-local" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Reason
            <input className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal" maxLength={1000} minLength={3} name="reason" required />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2" disabled={saving} type="submit">Save new time</button>
        </form>
      )}
      <div className="mt-3">
        <button className="text-xs font-semibold text-slate-600 underline" onClick={loadHistory} type="button">
          {history ? 'Refresh booking history' : 'View booking history'}
        </button>
        {historyError && <p className="mt-2 text-xs text-red-700" role="alert">{historyError}</p>}
        {history && (
          <ol className="mt-2 space-y-2 border-l-2 border-stone-200 pl-3 text-xs text-slate-600">
            {history.statusHistory.map((entry, index) => (
              <li key={`status-${index}`}>
                <strong className="capitalize">{entry.status.replaceAll('_', ' ')}</strong> · {entry.changedBy} · {new Date(entry.changedAt).toLocaleString()}
                {entry.note && <p className="mt-0.5">{entry.note}</p>}
              </li>
            ))}
            {history.scheduleHistory.map((entry, index) => (
              <li key={`schedule-${index}`}>
                <strong>Rescheduled</strong> · {entry.changedBy} · {new Date(entry.changedAt).toLocaleString()}
                <p className="mt-0.5">{new Date(entry.previousRequestedAt).toLocaleString()} to {new Date(entry.requestedAt).toLocaleString()} — {entry.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function NotificationList({ notifications, onRead, saving }) {
  if (notifications.length === 0) return <EmptyState message="You have no notifications." />;
  return (
    <div className="mt-4 space-y-3">
      {notifications.map((notification) => (
        <article className={`rounded-xl border p-4 ${notification.isRead ? 'border-stone-200 bg-white' : 'border-amber-200 bg-amber-50'}`} key={notification.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{notification.title}</h3><p className="mt-1 text-sm text-slate-600">{notification.message}</p></div>
            {!notification.isRead && <button className="text-xs font-semibold text-amber-900 underline" disabled={saving} onClick={() => onRead(notification.id)} type="button">Mark read</button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function TextField({ label, ...props }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" {...props} />
    </label>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" {...props} />
    </label>
  );
}

function EmptyState({ message }) {
  return <p className="rounded-2xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-slate-600">{message}</p>;
}
