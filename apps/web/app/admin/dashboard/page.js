'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  { key: 'verification', label: 'Provider verification' },
  { key: 'users', label: 'Users' },
  { key: 'deletions', label: 'Deletion requests' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'categories', label: 'Categories' },
  { key: 'activity', label: 'Audit activity' },
  { key: 'notifications', label: 'Notifications' },
];

const complaintActions = {
  open: ['investigating', 'resolved', 'closed'],
  investigating: ['resolved', 'closed'],
  resolved: ['investigating', 'closed'],
  closed: [],
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [providers, setProviders] = useState([]);
  const [users, setUsers] = useState([]);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [logs, setLogs] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [categories, setCategories] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [tab, setTab] = useState('overview');
  const [verificationFilter, setVerificationFilter] = useState('pending');
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [complaintReasons, setComplaintReasons] = useState({});
  const [deletionReasons, setDeletionReasons] = useState({});
  const [reviewReasons, setReviewReasons] = useState({});
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState('');
  const [savingComplaint, setSavingComplaint] = useState('');
  const [savingReview, setSavingReview] = useState('');
  const [savingCategory, setSavingCategory] = useState('');
  const [savingAccount, setSavingAccount] = useState('');
  const [savingDeletion, setSavingDeletion] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDashboard = useCallback(async (status = verificationFilter) => {
    const identity = await apiRequest('/auth/session');
    if (identity.user.role !== 'admin') {
      router.replace(roleDashboard(identity.user.role));
      return;
    }
    const [summary, providerResult, userResult, deletionResult, logResult, complaintResult, reviewResult, categoryResult, financialResult] = await Promise.all([
      apiRequest('/admin/dashboard'),
      apiRequest(`/admin/providers?status=${encodeURIComponent(status)}`),
      apiRequest('/admin/users'),
      apiRequest('/admin/deletion-requests?status=pending'),
      apiRequest('/admin/audit-logs'),
      apiRequest('/admin/complaints?status=all'),
      apiRequest('/admin/reviews'),
      apiRequest('/admin/categories'),
      apiRequest('/admin/reports/financial'),
    ]);
    setUser(identity.user);
    setDashboard(summary.stats);
    setProviders(providerResult.providers);
    setUsers(userResult.users);
    setDeletionRequests(deletionResult.requests);
    setLogs(logResult.logs);
    setComplaints(complaintResult.complaints);
    setReviews(reviewResult.reviews);
    setCategories(categoryResult.categories);
    setFinancialSummary(financialResult.financialSummary);
  }, [router, verificationFilter]);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .catch((loadError) => {
        if (!cancelled) {
          if (loadError.message.includes('Authentication required') || loadError.message.includes('invalid or expired')) {
            router.replace('/login?next=%2Fadmin%2Fdashboard');
          } else if (loadError.message.includes('not authorized')) {
            router.replace('/');
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

  async function reviewProvider(providerId, status) {
    setSavingProvider(providerId);
    setError('');
    setSuccess('');
    const reason = rejectionReasons[providerId]?.trim() || '';
    if (status === 'rejected' && !reason) {
      setError('Enter a reason before rejecting a provider verification.');
      setSavingProvider('');
      return;
    }
    try {
      const result = await apiRequest(`/admin/providers/${providerId}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingProvider('');
    }
  }

  async function downloadVerificationDocument(fileDocument) {
    setError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/admin/verification-documents/${fileDocument.id}/file`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        throw new Error(result?.message || 'Could not download the verification document.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `verification-document-${fileDocument.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  }

  async function moderateComplaint(complaintId, status) {
    const reason = complaintReasons[complaintId]?.trim() || '';
    if (reason.length < 3) {
      setError('Enter a moderation reason of at least 3 characters.');
      return;
    }
    setSavingComplaint(complaintId);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest(`/admin/complaints/${complaintId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingComplaint('');
    }
  }

  async function moderateReview(reviewId, isVisible) {
    const reason = reviewReasons[reviewId]?.trim() || '';
    if (reason.length < 3) {
      setError('Enter a moderation reason of at least 3 characters.');
      return;
    }
    setSavingReview(reviewId);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest(`/admin/reviews/${reviewId}/moderation`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible, reason }),
      });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingReview('');
    }
  }

  async function createCategory(event) {
    event.preventDefault();
    setSavingCategory('new');
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest('/admin/categories', {
        method: 'POST',
        body: JSON.stringify(categoryForm),
      });
      setCategoryForm({ name: '', slug: '', description: '' });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingCategory('');
    }
  }

  async function setCategoryActive(category) {
    setSavingCategory(category.id);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest(`/admin/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingCategory('');
    }
  }

  async function changeAccountStatus(account) {
    const status = account.accountStatus === 'suspended' ? 'active' : 'suspended';
    const reason = window.prompt(`Why are you ${status === 'suspended' ? 'suspending' : 'restoring'} this account?`);
    if (reason === null) {
      return;
    }
    if (reason.trim().length < 3) {
      setError('Enter a reason of at least 3 characters.');
      return;
    }
    setSavingAccount(account.id);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest(`/admin/users/${account.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: reason.trim() }),
      });
      await loadDashboard();
      setSuccess(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingAccount('');
    }
  }

  async function reviewDeletionRequest(requestId, status) {
    const reason = deletionReasons[requestId]?.trim() || '';
    if (reason.length < 3) {
      setError('Enter a decision reason of at least 3 characters.');
      return;
    }
    if (
      status === 'approved' &&
      !window.confirm('Approve this request? The account will be anonymized, its private identity uploads removed, provider listings disabled, and access revoked. Booking, payment and audit records will remain.')
    ) {
      return;
    }
    setSavingDeletion(requestId);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest(`/admin/deletion-requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      await loadDashboard();
      setSuccess(result.message);
      if (result.cleanupWarning) {
        setError(result.cleanupWarning);
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSavingDeletion('');
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading admin workspace…</main>;
  }
  if (!user || !dashboard) {
    return (
      <main className="min-h-screen bg-stone-100 p-8">
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 text-sm text-red-800" role="alert">
          {error || 'Could not load the administration workspace.'}
          <p className="mt-3"><a className="font-semibold underline" href="/login">Sign in again</a></p>
        </div>
      </main>
    );
  }

  return (
    <DashboardShell role="admin" user={user}>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Platform operations</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Admin dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Monitor platform activity and review provider verification requests.</p>
      </div>
      <InlineNotice error={error} success={success} />
      <DashboardTabs items={tabs} selected={tab} onSelect={setTab} />

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total accounts" value={dashboard.totalUsers} detail={`${dashboard.customers} customers · ${dashboard.fundis} fundis`} />
            <MetricCard label="Provider profiles" value={dashboard.totalProviders} detail={`${dashboard.pendingVerifications} awaiting review`} />
            <MetricCard label="Bookings" value={dashboard.totalBookings} detail={`${dashboard.completedBookings} completed · ${dashboard.cancelledBookings} cancelled`} />
            <MetricCard label="Recorded successful payments" value={dashboard.successfulPayments} detail={`${formatKES(dashboard.collectedAmount)} confirmed as collected`} />
            <MetricCard label="Gross booking value" value={formatKES(dashboard.grossBookingValue)} detail="Confirmed through closed jobs; not a payment total" />
            <MetricCard label="Recorded refunds" value={formatKES(dashboard.recordedRefundAmount)} detail="Status records only; no money movement" />
            <MetricCard label="Complaints to review" value={dashboard.unresolvedComplaints} detail={`${dashboard.totalComplaints} total complaints`} />
            <MetricCard
              label="Platform revenue"
              value={financialSummary?.platformRevenue === null ? 'Not configured' : formatKES(financialSummary?.platformRevenue)}
              detail="No commission is calculated before an approved policy is configured"
            />
          </div>
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Provider review queue</h2>
                <p className="mt-1 text-sm text-slate-600">Review profile details and record a reason for any rejection.</p>
              </div>
              <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white" onClick={() => setTab('verification')} type="button">
                Review {dashboard.pendingVerifications} pending
              </button>
            </div>
            {providers.length === 0
              ? <p className="mt-5 text-sm text-slate-500">No providers are waiting for review.</p>
              : <ProviderList providers={providers.slice(0, 3)} savingProvider={savingProvider} rejectionReasons={rejectionReasons} setRejectionReasons={setRejectionReasons} onReview={reviewProvider} onDownloadDocument={downloadVerificationDocument} />}
          </section>
        </>
      )}

      {tab === 'verification' && (
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Provider verification</h2>
              <p className="mt-1 text-sm text-slate-600">Approving a provider makes their active listings eligible for public search.</p>
            </div>
            <label className="text-sm font-semibold text-slate-700">
              Show
              <select
                className="ml-2 rounded-lg border border-stone-300 bg-white px-3 py-2"
                onChange={(event) => setVerificationFilter(event.target.value)}
                value={verificationFilter}
              >
                <option value="pending">Pending</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All providers</option>
              </select>
            </label>
          </div>
          {providers.length === 0
            ? <EmptyState message="There are no providers matching this filter." />
            : <ProviderList providers={providers} savingProvider={savingProvider} rejectionReasons={rejectionReasons} setRejectionReasons={setRejectionReasons} onReview={reviewProvider} onDownloadDocument={downloadVerificationDocument} />}
        </section>
      )}

      {tab === 'users' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Accounts</h2>
          {users.length === 0 ? <EmptyState message="No accounts have been registered yet." /> : (
            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Email status</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((account) => (
                    <tr key={account.id}>
                      <td className="px-4 py-3 font-semibold">{account.firstName} {account.lastName}</td>
                      <td className="px-4 py-3 text-slate-600">{account.email}</td>
                      <td className="px-4 py-3 capitalize">{account.role}</td>
                      <td className="px-4 py-3"><StatusBadge status={account.accountStatus} /></td>
                      <td className="px-4 py-3">{account.emailVerifiedAt ? 'Verified' : 'Not verified'}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(account.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {account.role === 'admin' ? (
                          <span className="text-xs text-slate-500">Protected</span>
                        ) : (
                          <button
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                              account.accountStatus === 'suspended'
                                ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                                : 'border-red-200 text-red-700 hover:bg-red-50'
                            }`}
                            disabled={savingAccount === account.id}
                            onClick={() => changeAccountStatus(account)}
                            type="button"
                          >
                            {savingAccount === account.id
                              ? 'Saving…'
                              : account.accountStatus === 'suspended' ? 'Restore' : 'Suspend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-stone-100 px-4 py-3 text-xs text-slate-500">Showing up to 100 most recent accounts.</p>
            </div>
          )}
        </section>
      )}

      {tab === 'deletions' && (
        <section>
          <h2 className="mb-2 text-xl font-bold">Account deletion requests</h2>
          <p className="mb-4 max-w-3xl text-sm leading-6 text-slate-600">
            Approval anonymizes direct account and provider-profile identifiers, removes identity/profile uploads, disables provider listings, and revokes access. Existing bookings, payments and audit records are retained. Requests with open work cannot be approved until that work is resolved.
          </p>
          {deletionRequests.length === 0 ? <EmptyState message="No account deletion requests are awaiting review." /> : (
            <div className="space-y-3">
              {deletionRequests.map((request) => (
                <article className="rounded-2xl border border-stone-200 bg-white p-5" key={request.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{request.user.firstName} {request.user.lastName}</h3>
                      <p className="mt-1 text-sm text-slate-600">{request.user.email} · {request.user.role}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Submitted {new Date(request.requestedAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={request.user.accountStatus} />
                  </div>
                  <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor={`deletion-reason-${request.id}`}>
                    Decision reason (required)
                  </label>
                  <textarea
                    className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    id={`deletion-reason-${request.id}`}
                    maxLength={1000}
                    onChange={(event) => setDeletionReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                    rows={2}
                    value={deletionReasons[request.id] || ''}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['approved', 'rejected'].map((status) => (
                      <button
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize disabled:opacity-50 ${
                          status === 'approved'
                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                            : 'border-stone-300 text-slate-700 hover:bg-stone-50'
                        }`}
                        disabled={savingDeletion === request.id}
                        key={status}
                        onClick={() => reviewDeletionRequest(request.id, status)}
                        type="button"
                      >
                        {savingDeletion === request.id ? 'Saving…' : status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'complaints' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Complaint moderation</h2>
          {complaints.length === 0 ? <EmptyState message="No complaints have been submitted." /> : (
            <div className="space-y-3">
              {complaints.map((complaint) => {
                const actions = complaintActions[complaint.status] || [];
                return (
                  <article className="rounded-2xl border border-stone-200 bg-white p-5" key={complaint.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{complaint.subject}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Booking {complaint.bookingReference} · {complaint.reporter.firstName} {complaint.reporter.lastName} reported
                        </p>
                      </div>
                      <StatusBadge status={complaint.status} />
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{complaint.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Reported against {complaint.against.firstName} {complaint.against.lastName}
                    </p>
                    {actions.length > 0 && (
                      <div className="mt-4 border-t border-stone-100 pt-4">
                        <label className="block text-sm font-semibold text-slate-700" htmlFor={`complaint-reason-${complaint.id}`}>
                          Moderation reason
                        </label>
                        <textarea
                          className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          id={`complaint-reason-${complaint.id}`}
                          maxLength={1000}
                          onChange={(event) => setComplaintReasons((current) => ({ ...current, [complaint.id]: event.target.value }))}
                          rows={2}
                          value={complaintReasons[complaint.id] || ''}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {actions.map((status) => (
                            <button
                              className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold capitalize hover:bg-stone-50 disabled:opacity-50"
                              disabled={savingComplaint === complaint.id}
                              key={status}
                              onClick={() => moderateComplaint(complaint.id, status)}
                              type="button"
                            >
                              Mark {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'reviews' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Review moderation</h2>
          {reviews.length === 0 ? <EmptyState message="No reviews have been submitted." /> : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <article className="rounded-2xl border border-stone-200 bg-white p-5" key={review.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{review.rating.toFixed(1)} / 5 · Booking {review.bookingReference}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {review.reviewer.firstName} {review.reviewer.lastName} reviewed {review.provider.firstName} {review.provider.lastName}
                        {' · '}{new Date(review.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={review.isVisible ? 'visible' : 'hidden'} />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {review.comment || 'No written feedback.'}
                  </p>
                  {review.moderationReason && (
                    <p className="mt-2 text-xs text-slate-500">
                      Latest moderation reason: {review.moderationReason}
                      {review.moderator ? ` · ${review.moderator.firstName} ${review.moderator.lastName}` : ''}
                    </p>
                  )}
                  <div className="mt-4 border-t border-stone-100 pt-4">
                    <label className="block text-sm font-semibold text-slate-700" htmlFor={`review-reason-${review.id}`}>
                      Moderation reason
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                      id={`review-reason-${review.id}`}
                      maxLength={1000}
                      onChange={(event) => setReviewReasons((current) => ({ ...current, [review.id]: event.target.value }))}
                      rows={2}
                      value={reviewReasons[review.id] || ''}
                    />
                    <button
                      className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                        review.isVisible
                          ? 'border-red-200 text-red-700 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                      }`}
                      disabled={savingReview === review.id}
                      onClick={() => moderateReview(review.id, !review.isVisible)}
                      type="button"
                    >
                      {savingReview === review.id ? 'Saving…' : review.isVisible ? 'Hide review' : 'Restore review'}
                    </button>
                  </div>
                </article>
              ))}
              <p className="text-xs text-slate-500">Showing up to 200 most recent reviews.</p>
            </div>
          )}
        </section>
      )}

      {tab === 'categories' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Service categories</h2>
          <form className="mb-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2" onSubmit={createCategory}>
            <label className="block text-sm font-semibold text-slate-700">
              Category name
              <input
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                maxLength={150}
                onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                required
                value={categoryForm.name}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              URL slug
              <input
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                maxLength={150}
                onChange={(event) => setCategoryForm((current) => ({ ...current, slug: event.target.value }))}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="electrical-services"
                required
                value={categoryForm.slug}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
              Description (optional)
              <textarea
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal"
                maxLength={5000}
                onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                value={categoryForm.description}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                disabled={savingCategory === 'new'}
                type="submit"
              >
                {savingCategory === 'new' ? 'Adding…' : 'Add category'}
              </button>
            </div>
          </form>
          {categories.length === 0 ? <EmptyState message="No service categories are configured." /> : (
            <div className="space-y-2">
              {categories.map((category) => (
                <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4" key={category.id}>
                  <div>
                    <p className="font-semibold">{category.name} <span className="ml-1 text-xs font-normal text-slate-500">/{category.slug}</span></p>
                    {category.description && <p className="mt-1 text-sm text-slate-600">{category.description}</p>}
                    <p className="mt-1 text-xs text-slate-500">{category.isActive ? 'Visible to customers' : 'Hidden from customers'}</p>
                  </div>
                  <button
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
                    disabled={savingCategory === category.id}
                    onClick={() => setCategoryActive(category)}
                    type="button"
                  >
                    {category.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'activity' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Administrative audit trail</h2>
          {logs.length === 0 ? <EmptyState message="Administrative actions will appear here as they are recorded." /> : (
            <ol className="space-y-3">
              {logs.map((log) => (
                <li className="rounded-xl border border-stone-200 bg-white p-4" key={log.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{log.action.replaceAll('_', ' ')}</p>
                    <time className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {log.actor ? `${log.actor.firstName} ${log.actor.lastName} (${log.actor.email})` : 'System'}
                    {' · '}{log.entityType}{log.entityId ? ` #${log.entityId}` : ''}
                  </p>
                  {log.details?.reason && <p className="mt-2 text-sm text-slate-600">Reason: {log.details.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'notifications' && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Notifications</h2>
          <NotificationPreferences />
        </section>
      )}
    </DashboardShell>
  );
}

function ProviderList({ providers, savingProvider, rejectionReasons, setRejectionReasons, onReview, onDownloadDocument }) {
  return (
    <div className="mt-5 space-y-3">
      {providers.map((provider) => (
        <article className="rounded-xl border border-stone-200 p-4" key={provider.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{provider.businessName || `${provider.user.firstName} ${provider.user.lastName}`}</h3>
                <StatusBadge status={provider.verificationStatus} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{provider.user.email} · {provider.experienceYears || 0} years&apos; experience</p>
              {provider.bio && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">{provider.bio}</p>}
              <p className="mt-2 text-xs text-slate-500">Submitted {new Date(provider.createdAt).toLocaleDateString()}</p>
              <div className="mt-3">
                <p className="text-sm font-semibold">Private verification documents</p>
                {provider.verificationDocuments.length === 0
                  ? <p className="mt-1 text-sm text-slate-500">No evidence uploaded.</p>
                  : <ul className="mt-1 space-y-1">
                    {provider.verificationDocuments.map((fileDocument) => (
                      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" key={fileDocument.id}>
                        <span>{fileDocument.originalFilename} · {fileDocument.documentType} · {(fileDocument.sizeBytes / 1024).toFixed(0)} KB</span>
                        <button
                          className="font-semibold text-amber-800 underline"
                          onClick={() => onDownloadDocument(fileDocument)}
                          type="button"
                        >
                          Download securely
                        </button>
                      </li>
                    ))}
                  </ul>}
              </div>
            </div>
            {['pending', 'resubmitted'].includes(provider.verificationStatus) && (
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  disabled={savingProvider === provider.id}
                  onClick={() => onReview(provider.id, 'approved')}
                  type="button"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
          {['pending', 'resubmitted'].includes(provider.verificationStatus) && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`rejection-${provider.id}`}>Reason for rejecting {provider.businessName || provider.user.firstName}</label>
              <input
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                id={`rejection-${provider.id}`}
                maxLength={1000}
                onChange={(event) => setRejectionReasons((current) => ({ ...current, [provider.id]: event.target.value }))}
                placeholder="Reason required to reject"
                value={rejectionReasons[provider.id] || ''}
              />
              <button
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={savingProvider === provider.id}
                onClick={() => onReview(provider.id, 'rejected')}
                type="button"
              >
                Reject
              </button>
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
