import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, MailCheckIcon, RefreshCwIcon, ShieldCheckIcon, XCircleIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import api from '../api/client';

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
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const boxRefs = useRef([]);

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

  // Auto-verify when all six boxes are filled.
  useEffect(() => {
    if (state !== 'code') return;
    if (digits.every((d) => d !== '')) {
      submitCode(digits.join(''));
    }
  }, [digits]); // eslint-disable-line react-hooks/exhaustive-deps

  // 60s resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const setDigit = (i, value) => {
    const clean = value.replace(/\D/g, '');
    const next = [...digits];
    next[i] = clean.slice(-1);
    setDigits(next);
    if (clean && i < CODE_LEN - 1) boxRefs.current[i + 1]?.focus();
  };

  const submitCode = async (code) => {
    if (codeBusy || code.length !== CODE_LEN) return;
    setCodeBusy(true);
    setCodeError('');
    try {
      await api('/auth/verify-code', { method: 'POST', body: { email, code } });
      setState('ok');
      setMessage('Your email is verified — welcome to Mesa OS.');
    } catch (e) {
      setCodeError(e?.message || 'That code is invalid or has expired.');
      setDigits(Array(CODE_LEN).fill(''));
      boxRefs.current[0]?.focus();
    } finally {
      setCodeBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || codeBusy) return;
    setResent(false);
    setCodeError('');
    try {
      await api('/auth/resend-code', { method: 'POST', body: { email } });
      setResent(true);
      setCooldown(60);
    } catch (e) {
      if (e?.status === 429) {
        setCodeError('Please wait a minute before requesting another code.');
        setCooldown(60);
      } else {
        setCodeError(e?.message || 'Could not resend the code.');
      }
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[480px] flex-col items-center justify-center">
      <div className="w-full rounded-card border border-line bg-surface p-8 text-center">
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
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !d && i > 0) boxRefs.current[i - 1]?.focus();
                  }} />
              ))}
            </div>

            {codeError && <p className="mt-3 text-sm font-semibold text-status-red">{codeError}</p>}
            {resent && <p className="mt-3 text-sm font-semibold text-status-green">A fresh code is on its way.</p>}

            <div className="mt-5 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={resend} disabled={cooldown > 0 || codeBusy} icon={<RefreshCwIcon className="h-3.5 w-3.5" />}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
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
            <p className="mt-2 text-xs text-meta">Your dashboard is unlocked — sign in to get going.</p>
            <Button variant="dark" className="mt-6" onClick={() => navigate('/login')}>
              Sign in
            </Button>
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
            <Pill tone="amber" className="mt-4">Nothing to verify</Pill>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-meta">
        Trouble? <Button variant="quiet" size="sm" className="underline">Contact support</Button>
      </p>
    </div>
  );
}