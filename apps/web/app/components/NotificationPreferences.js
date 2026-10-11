'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/notifications/preferences')
      .then((result) => {
        if (active) setPreferences(result.preferences);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function savePreferences(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      });
      setPreferences(result.preferences);
      setMessage(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 max-w-2xl space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div>
        <h3 className="font-bold">Notification preferences</h3>
        <p className="mt-1 text-sm text-slate-600">
          Choose whether to receive marketplace updates in the app or by email. Account verification and password recovery emails are not affected.
        </p>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
      {loading ? (
        <p className="text-sm text-slate-600">Loading preferences…</p>
      ) : preferences && (
        <form className="space-y-4" onSubmit={savePreferences}>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              checked={preferences.inAppEnabled}
              disabled={saving}
              onChange={(event) => setPreferences({
                ...preferences,
                inAppEnabled: event.target.checked,
              })}
              type="checkbox"
            />
            In-app notifications
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              checked={preferences.emailEnabled}
              disabled={saving}
              onChange={(event) => setPreferences({
                ...preferences,
                emailEnabled: event.target.checked,
              })}
              type="checkbox"
            />
            Marketplace email notifications
          </label>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </form>
      )}
    </section>
  );
}
