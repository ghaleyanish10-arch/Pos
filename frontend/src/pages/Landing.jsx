import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConciergeBellIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { AuthCard, AuthHeader } from '../components/auth/AuthChrome';
import { api, authorizeSession, hasApiSession } from '../api/client';

const GoogleGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.6c-.1 1.1-.8 2.8-2.4 3.9l3.7 2.9c2.3-2.1 3.6-5.2 3.6-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.1 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4l-3.9-3C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l3.9-3z" />
    <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l3.9 3c1-2.9 3.7-4.9 6.9-4.9z" />
  </svg>
);

/**
 * The visitor landing page: sign in or create an owner account, toggled in
 * place — no separate route. Google is the primary door when the server has
 * it configured; email + password is always available underneath. Staff never
 * see this — the shared-device PIN terminal lives at /terminal.
 */
export function Landing() {
  const [mode, setMode] = useState('login'); // login | signup
  const [providers, setProviders] = useState(null);
  const [form, setForm] = useState({ business: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Already holding a live session (stale tab, old bookmark): the
    // dashboard is the only sensible destination.
    if (hasApiSession()) {
      navigate('/', { replace: true });
      return;
    }
    let alive = true;
    api('/auth/providers')
      .then((res) => { if (alive) setProviders(res); })
      .catch(() => { if (alive) setProviders({ google: false, password: true }); });
    return () => { alive = false; };
  }, [navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const email = form.email.trim();
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      if (mode === 'signup') {
        const business = form.business.trim();
        if (!business) { setError('Enter your business name.'); setBusy(false); return; }
        if (form.password !== form.confirm) { setError('Passwords do not match.'); setBusy(false); return; }
        const created = await api('/auth/signup', { method: 'POST', body: { name: business, email, password: form.password } });
        // OTP verification: the 6-digit code went to the inbox. New accounts
        // go to the verify screen; a signup on an existing verified address
        // (or with email off) falls back to the dashboard.
        if (created?.needs_verification) {
          navigate(`/verify-email?email=${encodeURIComponent(email)}`, { replace: true });
          return;
        }
        const res = await api('/auth/login', { method: 'POST', body: { email, password: form.password } });
        await authorizeSession(res);
        navigate('/', { replace: true });
      } else {
        const res = await api('/auth/login', { method: 'POST', body: { email, password: form.password } });
        await authorizeSession(res);
        // No email_verified detour while verification is off.
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(
        mode === 'signup' && err?.status === 409
          ? 'An account with that email already exists — sign in instead.'
          : (err?.message || (mode === 'signup' ? 'Signup failed.' : 'Sign in failed — check your credentials.'))
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setForm({ business: '', email: '', password: '', confirm: '' });
  };

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <AuthHeader>
        <Link
          to="/terminal"
          className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink sm:flex">
          <ConciergeBellIcon className="h-3.5 w-3.5" />
          Staff terminal
        </Link>
      </AuthHeader>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-5 py-10 lg:flex-row lg:gap-20 lg:px-10">
        {/* Pitch side */}
        <section className="max-w-md text-center lg:text-left">
          <h1 className="text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
            Run the whole floor<br />from one screen.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-meta">
            Orders, kitchen display, tables, inventory, staff and payments — Mesa OS keeps
            your restaurant moving from the register to the back of house.
          </p>
          <ul className="mt-6 space-y-2.5 text-left">
            {[
              ['Register & payments', 'Take orders, split bills, email receipts.'],
              ['Kitchen display', 'Live tickets named by table, the moment they land.'],
              ['Team & shifts', 'PIN clock-in on any approved terminal.']
            ].map(([t, d]) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-green" />
                <p className="text-sm text-ink"><span className="font-bold">{t}</span> <span className="text-meta">— {d}</span></p>
              </li>
            ))}
          </ul>
        </section>

        {/* Auth card side */}
        <section className="w-full max-w-[400px]">
          <AuthCard>
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-canvas p-1">
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`h-8 rounded-lg text-13 font-bold transition-colors duration-150 ease-soft ${
                  mode === m ? 'bg-surface text-ink shadow-sm' : 'text-meta hover:text-ink'
                }`}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="text-lg font-extrabold tracking-tight text-ink">
            {mode === 'login' ? 'Welcome back' : 'Start your business'}
          </h2>
          <p className="mt-1 text-13 text-meta">
            {mode === 'login' ? 'Sign in to your owner dashboard.' : 'One account runs the whole restaurant.'}
          </p>

          {providers?.google && (
            <>
              <a href="/api/v1/auth/google" className="mt-5 block">
                <Button variant="outline" full type="button" icon={<GoogleGlyph />}>
                  {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                </Button>
              </a>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-caption font-semibold text-meta">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'signup' && (
              <Field label="Business name">
                <input
                  className={inputClass}
                  autoComplete="organization"
                  value={form.business}
                  onChange={set('business')}
                  placeholder="e.g. Himalayan Kitchen" />
              </Field>
            )}
            <Field label="Work email">
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                placeholder="owner@yourrestaurant.com" />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={set('password')}
                placeholder={mode === 'login' ? '••••••••' : 'At least 8 characters'} />
            </Field>
            {mode === 'signup' && (
              <Field label="Confirm password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="Repeat your password" />
              </Field>
            )}

            {error && <p className="text-sm font-semibold text-status-red">{error}</p>}

            <Button variant="dark" full type="submit" disabled={busy}>
              {busy
                ? (mode === 'signup' ? 'Creating account…' : 'Signing in…')
                : (mode === 'signup' ? 'Create account' : 'Sign in')}
            </Button>
          </form>

          {mode === 'login' && (
            <p className="mt-4 text-center text-xs text-meta">
              <Link to="/forgot-password" className="font-semibold text-ink hover:underline">Forgot your password?</Link>
            </p>
          )}

          <p className="mt-4 text-center text-xs text-meta">
            {mode === 'login' ? 'New to Mesa OS? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="font-semibold text-ink hover:underline">
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          </AuthCard>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-3 text-center text-caption text-meta">
        Staff member? Open the <Link to="/terminal" className="font-semibold text-ink hover:underline">staff terminal</Link> to clock in with your PIN.
      </footer>
    </div>
  );
}
