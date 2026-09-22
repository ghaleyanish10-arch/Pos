import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { soundEngine, SOUND_EVENTS } from '../utils/sound';

const PREFS_KEY = 'mesa_sound_prefs';

export const DEFAULT_SOUND_PREFS = {
  master: true,
  channels: {
    orders: true,
    kitchen: true,
    payments: true,
    notifications: true,
    warnings: true
  },
  volume: 0.7
};

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_SOUND_PREFS;
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_SOUND_PREFS,
      ...saved,
      channels: { ...DEFAULT_SOUND_PREFS.channels, ...(saved.channels || {}) }
    };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

/**
 * SoundContext — preferences + the play API. Preferences persist across
 * sessions; the engine (utils/sound.js) owns everything audible.
 */
export function SoundProvider({ children }) {
  const prefs = useMemo(readPrefs, []);

  useEffect(() => {
    // Migrate the old single kitchen toggle into the new channel system once.
    const raw = localStorage.getItem('mesa_ops_settings');
    if (raw) {
      try {
        const ops = JSON.parse(raw);
        if (ops && ops.kitchenSound === false && prefs.channels.kitchen !== false) {
          localStorage.setItem(
            PREFS_KEY,
            JSON.stringify({ ...prefs, channels: { ...prefs.channels, kitchen: false } })
          );
          soundEngine.setPrefs({ ...prefs, channels: { ...prefs.channels, kitchen: false } });
          return;
        }
      } catch {
        /* ignore */
      }
    }
    soundEngine.setPrefs(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unlock on the first real user gesture — required before mobile browsers
  // will let WebAudio speak, and harmless everywhere else.
  useEffect(() => {
    const go = () => soundEngine.unlock();
    window.addEventListener('pointerdown', go, { once: true, capture: true });
    window.addEventListener('keydown', go, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', go, { capture: true });
      window.removeEventListener('keydown', go, { capture: true });
    };
  }, []);

  // Keep the engine in sync when the Settings section saves new prefs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key && e.key !== PREFS_KEY) return;
      soundEngine.setPrefs(readPrefs());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((patch) => {
    const next = {
      ...readPrefs(),
      ...patch,
      channels: { ...readPrefs().channels, ...(patch.channels || {}) }
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    soundEngine.setPrefs(next);
    window.dispatchEvent(new StorageEvent('storage', { key: PREFS_KEY }));
    return next;
  }, []);

  const play = useCallback((event, opts) => soundEngine.play(event, opts), []);

  const value = useMemo(
    () => ({
      prefs,
      update,
      play,
      events: Object.keys(SOUND_EVENTS),
      // Convenience wrappers — the documented API surface.
      playOrderSound: (opts) => play('orderCreated', opts),
      playOrderReceived: (opts) => play('orderReceived', opts),
      playOrderStatus: (opts) => play('orderStatus', opts),
      playSuccessSound: (opts) => play('success', opts),
      playNotificationSound: (opts) => play('notification', opts),
      playPaymentSound: (opts) => play('paymentSuccess', opts),
      playPaymentFailed: (opts) => play('paymentFailed', opts),
      playKdsSound: (opts) => play('kdsNew', opts),
      playKdsReady: (opts) => play('kdsReady', opts),
      playWarningSound: (opts) => play('warning', opts),
      playCriticalSound: (opts) => play('critical', opts)
    }),
    [prefs, update, play]
  );

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

const SoundContext = createContext(null);

export function useSound() {
  const ctx = useContext(SoundContext);
  // Never hard-fail: sound is enhancement, not load-bearing.
  return ctx || { prefs: DEFAULT_SOUND_PREFS, update: () => {}, play: () => {} };
}
