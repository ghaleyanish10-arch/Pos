import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, MailCheckIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import api from '../api/client';

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState(token ? 'verifying' : 'missing'); // verifying | ok | error | missing
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/auth/verify-email', { method: 'POST', body: { token } });
        if (cancelled) return;
        setState('ok');
        setMessage(res?.message || 'Your email is verified.');
      } catch (e) {
        if (cancelled) return;
        setState('error');
        setMessage(e?.message || 'This verification link is invalid or has expired.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[480px] flex-col items-center justify-center">
      <div className="w-full rounded-card border border-line bg-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-green text-status-green">
          <MailCheckIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Email verification</h1>

        {state === 'verifying' && (
          <p className="mt-3 text-sm text-meta">Checking your verification link…</p>
        )}

        {state === 'ok' && (
          <>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-status-green">
              <CheckCircleIcon className="h-5 w-5" />
              {message}
            </span>
            <p className="mt-2 text-xs text-meta">A welcome email is on its way. You can sign in now.</p>
            <Link
              to="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-ink px-6 text-sm font-bold text-white transition-opacity duration-150 ease-soft hover:opacity-90">
              Go to the app
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <span className="mt-4 inline-flex items-start gap-2 text-sm font-semibold text-status-red">
              <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              {message}
            </span>
            <p className="mt-3 text-xs text-meta">
              Request a new verification email, or ask an admin to resend it.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-6 text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40">
              Back to the app
            </Link>
          </>
        )}

        {state === 'missing' && (
          <>
            <p className="mt-3 text-sm text-meta">
              This page needs a verification token — open the link from your email.
            </p>
            <Pill tone="amber" className="mt-4">No token found</Pill>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-meta">
        Trouble? <Button variant="quiet" size="sm" className="underline">Contact support</Button>
      </p>
    </div>
  );
}
