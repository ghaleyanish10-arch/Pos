import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import api, { setElevationToken, clearElevationToken } from '../api/client';

const ElevationContext = createContext(null);

/**
 * Step-up authorization for privileged actions. A privileged call that comes
 * back with code=ELEVATION_REQUIRED opens the PIN modal; on success the token
 * lives in memory only (never localStorage) and the original call is retried
 * once with the X-Elevation-Token header attached.
 */
export function ElevationProvider({ children }) {
  const [prompt, setPrompt] = useState(null); // { action, resourceId, label, resolve }
  const [pin, setPin] = useState('');
  const [holderId, setHolderId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [holders, setHolders] = useState(null);

  const openPrompt = useCallback(async (action, label, resourceId = '') => {
    return new Promise((resolve) => {
      setPin('');
      setError('');
      setHolderId('');
      setHolders(null);
      setPrompt({ action, label, resourceId, resolve });
      // Which managers can authorize this? No secrets in this list.
      api('/staff/pin-holders')
        .then((res) => setHolders(res?.data || []))
        .catch(() => setHolders([]));
    });
  }, []);

  const cancel = useCallback(() => {
    if (prompt?.resolve) prompt.resolve(null);
    setPrompt(null);
    setPin('');
    setError('');
  }, [prompt]);

  const submit = useCallback(async () => {
    if (!prompt || !pin.trim() || !holderId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api('/auth/elevate', {
        method: 'POST',
        body: {
          pin_holder_user_id: holderId,
          pin: pin.trim(),
          action: prompt.action,
          resource_id: prompt.resourceId || undefined,
        },
      });
      setElevationToken(res.elevation_token);
      prompt.resolve(res.elevation_token);
      setPrompt(null);
      setPin('');
    } catch (e) {
      if (e.status === 423) {
        setError('PIN locked — too many attempts. Ask the boss to reset it.');
      } else {
        // Server message deliberately does not reveal whether the user or PIN was wrong.
        setError(e.message || 'Invalid PIN');
      }
    } finally {
      setBusy(false);
    }
  }, [prompt, pin, holderId]);

  const value = useMemo(() => ({ openPrompt, clearElevationToken }), [openPrompt]);

  return (
    <ElevationContext.Provider value={value}>
      {children}
      {prompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-pop">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-meta">Manager approval</p>
            <h2 className="mt-1 text-lg font-extrabold text-ink">{prompt.label || 'This action needs a manager'}</h2>
            <p className="mt-1 text-xs text-meta">
              Enter the manager PIN to authorize this single action. Nothing is stored.
            </p>

            {Array.isArray(holders) && holders.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Authorizing manager</p>
                <div className="flex flex-wrap gap-1.5">
                  {holders.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHolderId(h.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        holderId === h.id
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-surface text-meta hover:text-ink'
                      }`}>
                      {h.name} · {h.role === 'Corporate Admin' ? 'Boss' : 'Manager'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="••••"
              className="mt-4 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-ink focus:border-ink focus:outline-none"
            />
            {error && <p className="mt-2 text-xs font-semibold text-status-red">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={cancel}
                className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-meta hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !pin.trim() || !holderId}
                onClick={submit}
                className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                {busy ? 'Checking…' : 'Authorize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ElevationContext.Provider>
  );
}

export function useElevation() {
  const ctx = useContext(ElevationContext);
  if (!ctx) throw new Error('useElevation must be used within ElevationProvider');
  return ctx;
}

/**
 * Runs a privileged API call; when the server answers ELEVATION_REQUIRED,
 * prompts for a PIN and retries exactly once with the elevation token.
 */
export async function withElevation(apiFn, openPrompt, action, label, resourceId = '') {
  try {
    return await apiFn();
  } catch (e) {
    if (e.code === 'ELEVATION_REQUIRED') {
      const token = await openPrompt(action, label, resourceId);
      if (!token) {
        const err = new Error('Manager approval was cancelled');
        err.cancelled = true;
        throw err;
      }
      return await apiFn(); // client now carries the X-Elevation-Token header
    }
    throw e;
  }
}
