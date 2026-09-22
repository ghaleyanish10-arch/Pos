import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { AuthCard, AuthShell, BrandLogo } from '../components/auth/AuthChrome';
import { authorizeSession } from '../api/client';

export function AuthCallback() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [state, setState] = useState('working'); // working | ok | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) { setState('error'); setMessage('This sign-in returned no session. Try again on the login page.'); }
        return;
      }
      try {
        // The token is a real JWT from the backend callback; authorizeSession
        // stores it and hydrates the profile from /auth/me (including the
        // authoritative email_verified flag).
        await authorizeSession({ tokens: { access_token: token }, user: { email: params.get('email') || '' } });
        if (!cancelled) {
          setState('ok');
          // Verification is off for now — everyone lands on the dashboard.
          // (The email_verified detour returns when verification is on.)
          setTimeout(() => navigate('/', { replace: true }), 700);
        }
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setMessage(e?.message || 'This sign-in could not be completed.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate, params]);

  return (
    <AuthShell>
      <BrandLogo />
      <AuthCard className="text-center">
        {state === 'working' && (
          <>
            <Loader2Icon className="mx-auto h-8 w-8 animate-spin text-meta" />
            <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Finishing your sign-in…</h1>
          </>
        )}
        {state === 'ok' && (
          <>
            <CheckCircleIcon className="mx-auto h-8 w-8 text-status-green" />
            <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Signed in</h1>
            <p className="mt-2 text-sm text-meta">Taking you to your dashboard.</p>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircleIcon className="mx-auto h-8 w-8 text-status-red" />
            <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Sign-in failed</h1>
            <p className="mt-2 text-sm text-meta">{message}</p>
            <Button variant="dark" full className="mt-6" onClick={() => navigate('/')}>
              Back to sign in
            </Button>
          </>
        )}
        {state !== 'error' && (
          <Link to="/" className="btn btn-ghost mt-6">
            Skip for now
          </Link>
        )}
      </AuthCard>
    </AuthShell>
  );
}