import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogInIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { api, authorizeSession } from '../api/client';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      const user = await authorizeSession(res);
      toast('Welcome back', { tone: 'green' });
      if (user?.email_verified === false) {
        navigate(`/verify-email?email=${encodeURIComponent(user.email)}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err?.message || 'Sign in failed — check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[420px] flex-col items-center justify-center">
      <div className="w-full rounded-card border border-line bg-surface p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white">
          <LogInIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-center text-xl font-extrabold tracking-tight text-ink">Owner sign in</h1>
        <p className="mt-1 text-center text-sm text-meta">Email or Google — your choice.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@mesa.os" />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" />
          </Field>

          {error && <p className="text-sm font-semibold text-status-red">{error}</p>}

          <Button variant="dark" full type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
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

        <div className="mt-5 space-y-1.5 text-center text-xs text-meta">
          <p>
            New business?{' '}
            <Link to="/signup" className="font-semibold text-ink hover:underline">
              Create an owner account
            </Link>
          </p>
          <p>
            <Link to="/forgot-password" className="font-semibold text-ink hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-meta">
        Staff? Clock in at the terminal instead — PINs are per-terminal.
      </p>
    </div>
  );
}