'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../lib/api.js';

export default function DashboardShell({ role, user, children }) {
  const router = useRouter();
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [sendingVerification, setSendingVerification] = useState(false);
  const roleLabel = role === 'admin'
    ? 'Administration'
    : role === 'customer' ? 'Customer workspace' : 'Fundi workspace';

  async function logOut() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function resendVerification() {
    setSendingVerification(true);
    setVerificationError('');
    setVerificationMessage('');
    try {
      const result = await apiRequest('/auth/verification/resend', { method: 'POST' });
      setVerificationMessage(result.message);
    } catch (error) {
      setVerificationError(error.message);
    } finally {
      setSendingVerification(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <a className="text-xl font-black tracking-tight text-slate-900" href="/">
              Fundi<span className="text-amber-600">Connect</span>
            </a>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-slate-500">{roleLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user.firstName} {user.lastName}</p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
            <button
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-stone-50"
              onClick={logOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {user.emailVerifiedAt ? null : (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-amber-950">
              Verify your email address to keep your account contact details current.
              {verificationMessage && <span className="ml-2 font-semibold" role="status">{verificationMessage}</span>}
              {verificationError && <span className="ml-2 font-semibold text-red-700" role="alert">{verificationError}</span>}
            </p>
            <button
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50"
              disabled={sendingVerification}
              onClick={resendVerification}
              type="button"
            >
              {sendingVerification ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

export function DashboardTabs({ items, selected, onSelect }) {
  return (
    <nav aria-label="Dashboard sections" className="mb-7 flex gap-2 overflow-x-auto border-b border-stone-200 pb-3">
      {items.map((item) => (
        <button
          aria-current={selected === item.key ? 'page' : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            selected === item.key
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-white hover:text-slate-900'
          }`}
          key={item.key}
          onClick={() => onSelect(item.key)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function MetricCard({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

export function StatusBadge({ status }) {
  const colors = {
    active: 'bg-emerald-100 text-emerald-800',
    suspended: 'bg-red-100 text-red-800',
    visible: 'bg-emerald-100 text-emerald-800',
    hidden: 'bg-red-100 text-red-800',
    requested: 'bg-amber-100 text-amber-800',
    quoted: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-indigo-100 text-indigo-800',
    accepted: 'bg-cyan-100 text-cyan-800',
    in_progress: 'bg-violet-100 text-violet-800',
    completed: 'bg-emerald-100 text-emerald-800',
    closed: 'bg-stone-200 text-stone-700',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-red-100 text-red-800',
    expired: 'bg-stone-200 text-stone-700',
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    resubmitted: 'bg-blue-100 text-blue-800',
    open: 'bg-amber-100 text-amber-800',
    investigating: 'bg-blue-100 text-blue-800',
    resolved: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] || 'bg-stone-100 text-slate-700'}`}>
      {String(status).replaceAll('_', ' ')}
    </span>
  );
}

export function InlineNotice({ error, success }) {
  if (!error && !success) {
    return null;
  }
  return (
    <p
      className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
        error
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
      role={error ? 'alert' : 'status'}
    >
      {error || success}
    </p>
  );
}
