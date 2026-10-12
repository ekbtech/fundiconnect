'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

export default function AccountDeletionRequest() {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest('/users/me/deletion-request')
      .then((result) => {
        if (!cancelled) {
          setRequest(result.request);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message);
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
  }, []);

  async function submitRequest() {
    if (!window.confirm('Submit an account deletion request for administrator review? Your account remains active until approval.')) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/users/me/deletion-request', { method: 'POST' });
      setRequest(result.request);
      setMessage(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest() {
    if (!window.confirm('Cancel your pending account deletion request?')) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/users/me/deletion-request', { method: 'PATCH' });
      setRequest((current) => current ? { ...current, status: 'cancelled' } : null);
      setMessage(result.message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 max-w-xl rounded-2xl border border-red-200 bg-white p-5">
      <h2 className="text-xl font-bold text-slate-900">Account deletion</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        An approved request anonymizes your name, email, profile details and identity uploads, disables provider listings, and revokes account access. Booking, payment and audit records are retained; open work must be resolved before approval.
      </p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-800" role="status">{message}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading request status…</p>
      ) : (
        <>
          {request && (
            <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
              <p className="font-semibold capitalize">Latest request: {request.status}</p>
              <p className="mt-1 text-slate-500">
                Submitted {new Date(request.requestedAt).toLocaleString()}
              </p>
              {request.reviewReason && (
                <p className="mt-2 text-slate-600">Administrator response: {request.reviewReason}</p>
              )}
            </div>
          )}
          {request?.status === 'pending' ? (
            <button
              className="mt-4 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50"
              disabled={saving}
              onClick={cancelRequest}
              type="button"
            >
              {saving ? 'Saving…' : 'Cancel deletion request'}
            </button>
          ) : request?.status !== 'approved' && (
            <button
              className="mt-4 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              disabled={saving}
              onClick={submitRequest}
              type="button"
            >
              {saving ? 'Submitting…' : 'Request account deletion'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
