'use client';

import { useState } from 'react';
import { apiRequest } from '../lib/api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
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
        <h1 className="mt-8 text-2xl font-black">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-600">We’ll email a single-use reset link if an account matches.</p>
        {message && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</p>}
        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">Email address
            <input autoComplete="email" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <button className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-60" disabled={saving} type="submit">
            {saving ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600"><a className="font-semibold text-amber-800 underline" href="/login">Return to sign in</a></p>
      </section>
    </main>
  );
}
