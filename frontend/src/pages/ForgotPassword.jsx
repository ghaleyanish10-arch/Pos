import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRoundIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { AuthCard, AuthShell, BrandLogo } from '../components/auth/AuthChrome';
import api from '../api/client';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      if (err?.status === 503) {
        setError('Email is not configured on the server yet — set RESEND_API_KEY and EMAIL_FROM.');
      } else {
        setError(err?.message || 'Could not send the reset email.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <BrandLogo />
      <AuthCard>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-blue text-status-blue">
          <KeyRoundIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Forgot your password?</h1>

        {sent ? (
          <>
            <p className="mt-3 text-sm text-ink">
              If <span className="font-semibold">{email}</span> is registered, a reset link is on its
              way. Check the inbox (and spam) in a minute.
            </p>
            <p className="mt-2 text-xs text-meta">The link expires in 1 hour.</p>
            <Link
              to="/"
              className="btn btn-outline mt-6 w-full">
              Back to the app
            </Link>
          </>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label="Account email">
              <input
                className={inputClass}
                type="email"
                required
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <p className="rounded-xl bg-tint-red px-3 py-2 text-xs font-semibold text-status-red">{error}</p>}
            <Button variant="dark" full type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a reset link'}
            </Button>
            <Link to="/" className="block text-center text-xs font-semibold text-meta hover:text-ink">
              Back to the app
            </Link>
          </form>
        )}
      </AuthCard>
    </AuthShell>
  );
}
