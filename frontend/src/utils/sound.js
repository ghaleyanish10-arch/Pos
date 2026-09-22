/**
 * Mesa OS sound engine — restaurant-POS audio feedback.
 *
 * Design goals: fast, clean, distinguishable in a busy dining room, and quiet
 * enough for all-day use. All sounds are synthesized with WebAudio (no asset
 * downloads, no loading lag, consistent across devices). Patterns are short
 * (≤0.45s) musical intervals chosen so related events sound related:
 *
 *   success   E5→G5   rising major 3rd — "done, all good"
 *   payment   C5→E5→G5 arpeggio — the cash-register moment
 *   notice    D5      single neutral tone — "fyi"
 *   notify    A5      single brighter tone — "look over here"
 *   warning   C5→A4   falling — "attention required"
 *   critical  A5 A5 E5 triple pulse — urgent but not alarming-sireny
 *   orderNew  G5→D6   bright leap — a new order just landed
 *   orderIn   E5→A5   received from another device/channel
 *   kdsReady  B5→E6   sparkle — food is up
 *   failure   E4→B3   falling minor — declined/failed
 *
 * Overload control: a priority lock prevents overlap (a playing sound blocks
 * lower-priority ones, critical preempts everything), repeated events inside
 * their cooldown window are swallowed, and order arrivals are grouped so a
 * rush of QR orders plays one chime — the UI badge still shows every order.
 */

// Event registry: pattern + routing. Channels map to the Settings toggles;
// priority decides what may preempt what (higher wins).
export const SOUND_EVENTS = {
  orderCreated: { pattern: 'orderNew', channel: 'orders', priority: 3, cooldown: 1100, group: true },
  orderReceived: { pattern: 'orderIn', channel: 'orders', priority: 3, cooldown: 900 },
  orderStatus: { pattern: 'notify', channel: 'orders', priority: 2, cooldown: 400 },
  paymentSuccess: { pattern: 'payment', channel: 'payments', priority: 3, cooldown: 500 },
  paymentFailed: { pattern: 'failure', channel: 'payments', priority: 4, cooldown: 800 },
  kdsNew: { pattern: 'orderNew', channel: 'kitchen', priority: 4, cooldown: 1100, group: true },
  kdsReady: { pattern: 'kdsReady', channel: 'kitchen', priority: 3, cooldown: 600 },
  lowStock: { pattern: 'warning', channel: 'warnings', priority: 3, cooldown: 30000 },
  printerError: { pattern: 'warning', channel: 'warnings', priority: 4, cooldown: 5000 },
  systemError: { pattern: 'critical', channel: 'warnings', priority: 5, cooldown: 3000 },
  critical: { pattern: 'critical', channel: 'warnings', priority: 5, cooldown: 2500 },
  warning: { pattern: 'warning', channel: 'warnings', priority: 3, cooldown: 1500 },
  success: { pattern: 'success', channel: 'notifications', priority: 2, cooldown: 250 },
  notification: { pattern: 'notify', channel: 'notifications', priority: 2, cooldown: 600 },
  notice: { pattern: 'notice', channel: 'notifications', priority: 1, cooldown: 400 }
};

// Note frequencies (Hz) — kept as data so patterns stay readable.
const N = {
  B3: 246.94, E4: 329.63, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25,
  G5: 783.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51
};

// [freq, startOffsetMs, durationMs, wave, gain] — wave/gain default to sine/1.
const PATTERNS = {
  success: [[N.E5, 0, 110], [N.G5, 90, 170]],
  payment: [[N.C5, 0, 90], [N.E5, 80, 90], [N.G5, 160, 200]],
  notice: [[N.D5, 0, 120]],
  notify: [[N.A5, 0, 130]],
  warning: [[N.C5, 0, 140, 'triangle'], [N.A4, 150, 200, 'triangle']],
  critical: [
    [N.A5, 0, 110, 'triangle', 1.1],
    [N.A5, 170, 110, 'triangle', 1.1],
    [N.E5, 340, 200, 'triangle', 1.1]
  ],
  orderNew: [[N.G5, 0, 110], [N.D6, 95, 190]],
  orderIn: [[N.E5, 0, 100], [N.A5, 90, 170]],
  kdsReady: [[N.B5, 0, 90], [N.E6, 80, 170]],
  failure: [[N.E4, 0, 150, 'triangle'], [N.B3, 150, 220, 'triangle']]
};

// Haptic equivalents (ms vibration patterns) — phones/handhelds only; a no-op
// where unsupported. Sound and buzz always accompany a visual change.
const HAPTICS = {
  orderCreated: [40, 60, 40],
  orderReceived: [40, 60, 40],
  paymentSuccess: 30,
  paymentFailed: [60, 50, 60],
  kdsNew: [40, 60, 40],
  critical: [80, 50, 80, 50, 80]
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.playingUntil = 0; // monotonic-ish end time of the current pattern
    this.lastPlayed = new Map(); // event → timestamp
    this.groupUntil = 0; // grouping window end for order arrivals
    this.grouped = 0;
    this.prefs = { master: true, channels: {}, volume: 0.7 };
  }

  setPrefs(prefs) {
    this.prefs = { ...this.prefs, ...prefs };
  }

  ensureCtx() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new Ctx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call once from a real user gesture so mobile browsers allow later audio. */
  unlock() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.02);
    } catch {
      /* ignore */
    }
  }

  enabledFor(event) {
    const def = SOUND_EVENTS[event];
    if (!def) return false;
    if (!this.prefs.master) return false;
    return this.prefs.channels[def.channel] !== false;
  }

  /**
   * Play a registered event. Options:
   *   force — bypass cooldown (used by the Settings preview buttons)
   *   groupKey — events sharing a key inside the group window play once
   * Returns a promise resolving true when audible. Async because the first
   * play after page load must await AudioContext.resume() — a synchronous
   * state check there dropped the very first click (the Settings Test button
   * bug): the context reports 'suspended' until resume settles.
   */
  async play(event, { force = false, groupKey = '' } = {}) {
    const def = SOUND_EVENTS[event];
    if (!def) return false;
    if (!force && !this.enabledFor(event)) return false;

    const now = Date.now();
    if (!force) {
      const last = this.lastPlayed.get(event) || 0;
      if (now - last < def.cooldown) return false;
      if (groupKey) {
        if (now < this.groupUntil && groupKey === this.activeGroup) {
          this.grouped += 1;
          return false; // swallowed into the current grouped chime
        }
        this.activeGroup = groupKey;
        this.groupUntil = now + def.cooldown;
        this.grouped = 1;
      }
      this.lastPlayed.set(event, now);
    }

    // Priority lock: a critical event preempts; lower priority waits.
    if (now < this.playingUntil && !force && def.priority < (this.currentPriority || 0)) {
      return false;
    }

    const pattern = PATTERNS[def.pattern];
    if (!pattern) return false;

    const ctx = this.ensureCtx();
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
      if (ctx.state !== 'running') return false;
    }

    const vol = Math.max(0, Math.min(1, Number(this.prefs.volume) || 0.7)) * 0.22;
    let longest = 0;

    try {
      const comp = ctx.createGain();
      comp.gain.value = 1;
      comp.connect(ctx.destination);
      for (const [freq, offsetMs, durMs, wave = 'sine', gain = 1] of pattern) {
        const t0 = ctx.currentTime + offsetMs / 1000;
        const dur = durMs / 1000;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol * gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(comp);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
        longest = Math.max(longest, offsetMs + durMs);
      }
    } catch {
      return false;
    }

    this.currentPriority = def.priority;
    this.playingUntil = Date.now() + longest;

    const buzz = HAPTICS[event === 'kdsNew' ? 'orderCreated' : event];
    if (buzz && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(buzz);
      } catch {
        /* unsupported */
      }
    }
    return true;
  }
}

export const soundEngine = new SoundEngine();
