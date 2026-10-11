'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api.js';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!token) {
      setError('This reset link is missing its token. Request a new link.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
      setPassword('');
      setConfirmation('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <a className="text-xl font-black tracking-tight" href="/">Fundi<span className="text-amber-600">Connect</span></a>
        <h1 className="mt-8 text-2xl font-black">Choose a new password</h1>
        {message && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message} <a className="font-semibold underline" href="/login">Sign in</a></p>}
        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">New password
            <input autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal" minLength={8} maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label className="block text-sm font-semibold">Confirm password
            <input autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal" minLength={8} maxLength={128} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
          </label>
          <button className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Saving…' : 'Reset password'}</button>
        </form>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading password reset…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
