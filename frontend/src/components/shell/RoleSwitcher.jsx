import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, KeyRoundIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import { api } from '../../api/client';
import { ROLES, SWITCH_KEY_FOR_ROLE, SWITCHABLE_ROLES, useRole } from '../../state/RoleContext';

/**
 * The hat switcher in the header. After the owner (or manager) logs in, this
 * shows the four realms — Kitchen, Manager, Cashier, Admin — and switching to
 * one re-verifies the staff member's OWN PIN with the server (the same PIN
 * clock-in uses, same lockout). The server re-mints the session, so the worn
 * role is real, not cosmetic. The current hat is highlighted; a boss session
 * is labeled "Admin" because that is the realm key the server accepts.
 *
 * Accounts with no PIN yet (typically an owner who signed up with Google, so
 * there is no password from which a PIN could exist) get the server's 409
 * NO_PIN_SET response and are offered an inline first-time PIN creation
 * instead of a dead-end error.
 */
export function RoleSwitcher() {
  const { role, session, switchRole } = useRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // switchable role key awaiting PIN
  const [creating, setCreating] = useState(false); // first-time PIN creation panel
  const [createPin, setCreatePin] = useState('');
  const [createPin2, setCreatePin2] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session) return null;

  const meta = ROLES[role];
  const close = () => {
    setOpen(false);
    setPending(null);
    setPin('');
    setError('');
    setCreating(false);
    setCreatePin('');
    setCreatePin2('');
  };

  const pick = (key) => {
    if (key === SWITCH_KEY_FOR_ROLE[role]) {
      close();
      return;
    }
    setPending(key);
    setPin('');
    setError('');
  };

  const confirm = async () => {
    if (!pending || pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await switchRole(pending, pin);
      close();
      // Session token + user are swapped server-side; the shell re-renders
      // with the new role's navigation. Land on the app's home dashboard —
      // the same page a fresh login lands on — rather than throwing the
      // wearer straight into a role-specific screen. The sidebar already
      // reflects the new hat, so the role's tools are one tap away.
      navigate('/', { replace: true });
    } catch (e) {
      if (e.code === 'NO_PIN_SET' || e.status === 409) {
        // No PIN exists for this account — offer creation instead of
        // counting failed attempts the user can never get right.
        setCreating(true);
        setError('');
      } else if (e.status === 423) {
        // The server returns locked_until — show a real countdown so staff
        // know the lock ends, and boss/manager can use their own login or
        // another manager's PIN instead of being told to "ask the boss".
        const mins = e.body?.locked_until
          ? Math.max(1, Math.ceil((new Date(e.body.locked_until) - Date.now()) / 60000))
          : null;
        setError(
          mins
            ? `PIN locked after too many attempts — try again in ${mins} minute${mins === 1 ? '' : 's'}.`
            : 'PIN locked after too many attempts — wait a few minutes and try again.'
        );
      } else if (e.status === 403) {
        setError('Your account cannot act as that role.');
      } else if (e.status === 401) {
        setError('That PIN did not match. Try again.');
      } else {
        // 404/network/etc: never disguise a broken server as a wrong PIN.
        setError(e.message || 'Could not reach the server — try again.');
      }
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    if (busy || createPin.length < 4 || createPin !== createPin2) return;
    setBusy(true);
    setError('');
    try {
      await api('/auth/pin', { method: 'POST', body: { pin: createPin } });
      // PIN exists now — retry the switch with it.
      const target = pending;
      setCreating(false);
      setCreatePin('');
      setCreatePin2('');
      setPin(createPin);
      await switchRole(target, createPin);
      close();
      navigate('/', { replace: true });
    } catch (e) {
      if (e.code === 'PIN_ALREADY_SET') {
        setCreating(false);
        setError('A PIN already exists — enter it to continue.');
      } else {
        // Validation messages (weak PIN etc.) come straight from the server.
        setError(e.message || 'Could not save the PIN — try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch role"
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface pl-3 pr-2.5 text-13 font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/5 text-micro font-bold text-ink">
          {meta?.initials}
        </span>
        <span className="hidden sm:block">{meta?.label}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-meta" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {!pending ? (
            <>
              <div className="border-b border-line px-4 py-3">
                <p className="text-13 font-bold text-ink">Switch role</p>
                <p className="text-caption text-meta">
                  Working as {session.name} — pick a hat to wear.
                </p>
              </div>
              <div className="p-2">
                {SWITCHABLE_ROLES.map((r) => {
                  const current = r.key === SWITCH_KEY_FOR_ROLE[role];
                  return (
                    <button
                      key={r.key}
                      type="button"
                      role="menuitem"
                      onClick={() => pick(r.key)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-13 font-semibold transition-colors duration-150 ease-soft ${
                        current
                          ? 'bg-ink/5 text-ink'
                          : 'text-meta hover:bg-canvas hover:text-ink'
                      }`}>
                      {r.label}
                      {current && (
                        <span className="rounded-full bg-status-green/15 px-2 py-0.5 text-caption font-semibold text-status-green">
                          Worn
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : creating ? (
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <KeyRoundIcon className="h-4 w-4 text-meta" />
                <p className="text-13 font-bold text-ink">Create your PIN</p>
              </div>
              <p className="text-caption leading-relaxed text-meta">
                Your account doesn&apos;t have a PIN yet. Pick a 4–6 digit PIN — you&apos;ll use it
                to switch roles and clock in.
              </p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={createPin}
                onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, ''))}
                placeholder="New PIN"
                aria-label="New PIN"
                className="mt-3 w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-ink focus:border-ink focus:outline-none"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={createPin2}
                onChange={(e) => setCreatePin2(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createPin.length >= 4 && createPin === createPin2) submitCreate();
                }}
                placeholder="Repeat PIN"
                aria-label="Repeat new PIN"
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-ink focus:border-ink focus:outline-none"
              />
              {createPin2.length > 0 && createPin !== createPin2 && (
                <p className="mt-2 text-caption font-semibold text-status-red">PINs don&apos;t match yet.</p>
              )}
              {error && <p className="mt-2 text-caption font-semibold text-status-red">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setCreatePin('');
                    setCreatePin2('');
                    setError('');
                  }}
                  className="btn btn-ghost flex-1 text-xs">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || createPin.length < 4 || createPin !== createPin2}
                  onClick={submitCreate}
                  className="btn btn-primary flex-1 gap-1.5 text-xs disabled:opacity-40">
                  {busy ? <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" /> : <KeyRoundIcon className="h-3.5 w-3.5" />}
                  {busy ? 'Saving…' : 'Create & switch'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlertIcon className="h-4 w-4 text-meta" />
                <p className="text-13 font-bold text-ink">
                  Confirm as {SWITCHABLE_ROLES.find((r) => r.key === pending)?.label}
                </p>
              </div>
              <p className="text-caption leading-relaxed text-meta">
                Enter <span className="font-semibold text-ink">your own PIN</span> — the same one you
                clock in with — to wear this role.
              </p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirm();
                }}
                placeholder="••••"
                className="mt-3 w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-ink focus:border-ink focus:outline-none"
              />
              {error && <p className="mt-2 text-caption font-semibold text-status-red">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setPin('');
                    setError('');
                  }}
                  className="btn btn-ghost flex-1 text-xs">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || pin.length < 4}
                  onClick={confirm}
                  className="btn btn-primary flex-1 gap-1.5 text-xs disabled:opacity-40">
                  {busy ? <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" /> : null}
                  {busy ? 'Checking…' : 'Switch'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
