import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheckIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { AuthCard, AuthShell, BrandLogo } from '../components/auth/AuthChrome';
import api from '../api/client';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, new_password: password } });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'This reset link is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <BrandLogo />
      <AuthCard>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-green text-status-green">
          <ShieldCheckIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Choose a new password</h1>

        {!token && !done && (
          <p className="mt-3 text-sm text-meta">
            This page needs a reset token — open the link from your email.
          </p>
        )}

        {done ? (
          <>
            <p className="mt-3 text-sm text-status-green font-semibold">
              Password updated. You can sign in with your new password now.
            </p>
            <Button variant="dark" full className="mt-6" onClick={() => navigate('/')}>
              Go to the app
            </Button>
          </>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label="New password">
              <input
                className={inputClass}
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <input
                className={inputClass}
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <p className="rounded-xl bg-tint-red px-3 py-2 text-xs font-semibold text-status-red">{error}</p>}
            <Button variant="dark" full type="submit" disabled={busy || !token}>
              {busy ? 'Saving…' : 'Reset password'}
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
