'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../lib/api.js';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [message, setMessage] = useState('Verifying your email address…');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError('This verification link is missing its token. Sign in and request another email.');
      setMessage('');
      return () => { cancelled = true; };
    }
    apiRequest('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then((result) => {
      if (!cancelled) setMessage(result.message);
    }).catch((requestError) => {
      if (!cancelled) {
        setError(requestError.message);
        setMessage('');
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <a className="text-xl font-black tracking-tight" href="/">Fundi<span className="text-amber-600">Connect</span></a>
        <h1 className="mt-8 text-2xl font-black">Email verification</h1>
        {message && <p className="mt-4 text-sm text-emerald-800" role="status">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        <p className="mt-6 text-sm text-slate-600"><a className="font-semibold text-amber-800 underline" href="/login">Return to sign in</a></p>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Verifying your email…</main>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
