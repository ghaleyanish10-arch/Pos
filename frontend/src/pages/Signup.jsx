import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlusIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { api } from '../api/client';

export function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) return setError('Enter your business name.');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      const res = await api('/auth/signup', { method: 'POST', body: { name, email, password: form.password } });
      toast(res?.message || 'Account created — check your email', { tone: 'green' });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err?.status === 409 ? 'An account with that email already exists — sign in instead.' : (err?.message || 'Signup failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[420px] flex-col items-center justify-center">
      <div className="w-full rounded-card border border-line bg-surface p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-green text-status-green">
          <UserPlusIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-center text-xl font-extrabold tracking-tight text-ink">Create your owner account</h1>
        <p className="mt-1 text-center text-sm text-meta">
          One account runs the whole business — you&apos;ll verify your email right after.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Business / owner name">
            <input
              className={inputClass}
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Himalayan Kitchen" />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              placeholder="owner@mesa.os" />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm password">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set('confirm')}
              placeholder="Repeat your password" />
          </Field>

          {error && <p className="text-sm font-semibold text-status-red">{error}</p>}

          <Button variant="green" full type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <a href="/api/v1/auth/google" className="block">
          <Button variant="outline" full type="button" icon={
            <span className="text-sm font-bold text-status-blue">G</span>
          }>
            Continue with Google
          </Button>
        </a>

        <p className="mt-5 text-center text-xs text-meta">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}