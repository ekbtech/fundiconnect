'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, roleDashboard } from '../lib/api.js';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-100 p-8 text-center text-slate-600">Loading sign-in…</main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/auth/session')
      .then(({ user }) => {
        if (!cancelled) {
          router.replace(roleDashboard(user.role));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user } = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const intendedPath = searchParams.get('next');
      const safeIntendedPath =
        intendedPath?.startsWith('/') && !intendedPath.startsWith('//') ? intendedPath : null;
      router.replace(safeIntendedPath || roleDashboard(user.role));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <a className="text-xl font-black tracking-tight" href="/">
          Fundi<span className="text-amber-600">Connect</span>
        </a>
        <h1 className="mt-8 text-2xl font-black">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to continue to your FundiConnect workspace.</p>
        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Email address
            <input
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          New to FundiConnect? <a className="font-semibold text-amber-800 hover:underline" href="/register">Create an account</a>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <a className="font-semibold text-amber-800 hover:underline" href="/forgot-password">Forgot your password?</a>
        </p>
      </section>
    </main>
  );
}
