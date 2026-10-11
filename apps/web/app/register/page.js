'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, roleDashboard } from '../lib/api.js';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'customer',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user } = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      router.replace(roleDashboard(user.role));
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
        <h1 className="mt-8 text-2xl font-black">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600">Join as a customer or register as a service provider.</p>
        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">
              First name
              <input
                autoComplete="given-name"
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500"
                name="firstName"
                onChange={update}
                required
                value={form.firstName}
              />
            </label>
            <label className="text-sm font-semibold">
              Last name
              <input
                autoComplete="family-name"
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500"
                name="lastName"
                onChange={update}
                required
                value={form.lastName}
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Email address
            <input
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500"
              name="email"
              onChange={update}
              required
              type="email"
              value={form.email}
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500"
              minLength={8}
              name="password"
              onChange={update}
              required
              type="password"
              value={form.password}
            />
          </label>
          <label className="block text-sm font-semibold">
            I want to
            <select
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-amber-500"
              name="role"
              onChange={update}
              value={form.role}
            >
              <option value="customer">Find and book a professional</option>
              <option value="fundi">Offer my professional services</option>
            </select>
          </label>
          <button
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          Already registered? <a className="font-semibold text-amber-800 hover:underline" href="/login">Sign in</a>
        </p>
      </section>
    </main>
  );
}
