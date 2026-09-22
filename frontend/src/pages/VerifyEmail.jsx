import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, MailCheckIcon, RefreshCwIcon, ShieldCheckIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { AuthCard, AuthShell, BrandLogo } from '../components/auth/AuthChrome';
import api, { authorizeSession } from '../api/client';

const CODE_LEN = 6;

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const navigate = useNavigate();

  // link mode
  const [state, setState] = useState(token ? 'verifying' : email ? 'code' : 'missing'); // verifying | ok | error | missing | code
  const [message, setMessage] = useState('');

  // code mode
  const [digits, setDigits] = useState(Array(CODE_LEN).fill(''));
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeErrorWarn, setCodeErrorWarn] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const boxRefs = useRef([]);

  const code = useMemo(() => digits.join(''), [digits]);
  const codeComplete = code.length === CODE_LEN && digits.every((d) => d !== '');

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

  // 60s resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const setDigit = (i, value) => {
    const clean = value.replace(/\D/g, '');
    const next = [...digits];
    // A single keystroke fills one box; a multi-character entry (autofill or
    // paste through onChange) spreads across the boxes from this one.
    if (clean.length > 1) {
      for (let k = 0; k < clean.length && i + k < CODE_LEN; k++) next[i + k] = clean[k];
      setDigits(next);
      boxRefs.current[Math.min(i + clean.length, CODE_LEN - 1)]?.focus();
      return;
    }
    next[i] = clean;
    setDigits(next);
    if (clean && i < CODE_LEN - 1) boxRefs.current[i + 1]?.focus();
  };

  // A paste anywhere fills the whole code from box 0, like OTP screens do.
  const onPaste = (e) => {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LEN).fill('');
    for (let k = 0; k < Math.min(pasted.length, CODE_LEN); k++) next[k] = pasted[k];
    setDigits(next);
    boxRefs.current[Math.min(pasted.length, CODE_LEN - 1)]?.focus();
  };

  const submitCode = async () => {
    if (codeBusy || !codeComplete) return;
    setCodeBusy(true);
    setCodeError('');
    setCodeErrorWarn(false);
    try {
      const res = await api('/auth/verify-code', { method: 'POST', body: { email, code } });
      // The backend mints the session at verify time — go straight in.
      if (res?.tokens?.access_token) {
        await authorizeSession(res);
        setState('ok');
        setMessage('Your email is verified — welcome to Mesa OS.');
        setTimeout(() => navigate('/', { replace: true }), 600);
        return;
      }
      setState('ok');
      setMessage('Your email is verified — welcome to Mesa OS.');
      setTimeout(() => navigate('/login', { replace: true }), 900);
    } catch (e) {
      // Distinct states per failure: expired code, locked (too many attempts),
      // plain wrong digit, already verified — each with its own copy. Wrong
      // digits keep every entered cell so the user can fix the exact box.
      switch (e?.code) {
        case 'CODE_EXPIRED':
          setCodeError('This code has expired — request a new one below.');
          setCodeErrorWarn(true);
          break;
        case 'CODE_BURNED':
          setCodeError('Too many wrong attempts — request a new code below.');
          setCodeErrorWarn(true);
          break;
        case 'CODE_INVALID': {
          const remaining = typeof e?.remaining === 'number' ? e.remaining : null;
          setCodeError(
            remaining != null && remaining > 0
              ? `That code is not right — ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
              : 'That code is not right — check it and try again.'
          );
          setCodeErrorWarn(false);
          break;
        }
        default:
          setCodeError(e?.message || 'That code is invalid or has expired.');
          setCodeErrorWarn(false);
      }
      boxRefs.current[0]?.focus();
      boxRefs.current[0]?.select();
    } finally {
      setCodeBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || codeBusy || resendBusy) return;
    setResendBusy(true);
    setResent(false);
    setCodeError('');
    setCodeErrorWarn(false);
    try {
      await api('/auth/resend-code', { method: 'POST', body: { email } });
      setResent(true);
      setCooldown(60);
    } catch (e) {
      if (e?.status === 429) {
        setCodeError('Please wait a minute before requesting another code.');
        setCodeErrorWarn(true);
        setCooldown(60);
      } else {
        setCodeError(e?.message || 'Could not resend the code.');
        setCodeErrorWarn(false);
      }
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <AuthShell>
      <BrandLogo />
      <AuthCard className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-green text-status-green">
          {state === 'code' ? <ShieldCheckIcon className="h-7 w-7" /> : <MailCheckIcon className="h-7 w-7" />}
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Email verification</h1>

        {state === 'code' && (
          <div className="mt-4">
            <p className="text-sm text-meta">
              Enter the <span className="font-mono font-bold text-ink">6-digit code</span> sent to
              <br />
              <span className="font-semibold text-ink">{email || 'your inbox'}</span>
            </p>

            <div className="mt-5 flex items-center justify-center gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { boxRefs.current[i] = el; }}
                  className="h-14 w-11 rounded-xl border border-line bg-canvas text-center font-mono text-xl font-bold text-ink focus:border-ink focus:outline-none"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={d}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onPaste={onPaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !d && i > 0) boxRefs.current[i - 1]?.focus();
                    if (e.key === 'Enter') submitCode();
                  }} />
              ))}
            </div>

            {codeError && (
              <p className={`mt-3 text-sm font-semibold ${codeErrorWarn ? 'text-status-amber' : 'text-status-red'}`}>
                {codeError}
              </p>
            )}
            {resent && <p className="mt-3 text-sm font-semibold text-status-green">A fresh code is on its way.</p>}

            <Button
              variant="dark"
              full
              className="mt-5"
              disabled={!codeComplete || codeBusy}
              onClick={submitCode}>
              {codeBusy ? 'Verifying…' : 'Verify'}
            </Button>

            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={resend} disabled={cooldown > 0 || codeBusy || resendBusy} icon={<RefreshCwIcon className="h-3.5 w-3.5" />}>
                {resendBusy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Button>
            </div>

            <p className="mt-5 text-xs text-meta">
              This keeps your dashboard locked until we know this inbox is yours.
            </p>
          </div>
        )}

        {state === 'verifying' && (
          <p className="mt-3 text-sm text-meta">Checking your verification link…</p>
        )}

        {state === 'ok' && (
          <>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-status-green">
              <CheckCircleIcon className="h-5 w-5" />
              {message}
            </span>
            <p className="mt-2 text-xs text-meta">Taking you to your dashboard…</p>
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
            <Button variant="outline" className="mt-6" onClick={() => navigate('/login')}>
              Back to sign in
            </Button>
          </>
        )}

        {state === 'missing' && (
          <>
            <p className="mt-3 text-sm text-meta">
              This page needs a verification code or link — open it from your email.
            </p>
            <p className="mt-4 text-13 font-semibold text-status-amber">Nothing to verify here yet.</p>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
