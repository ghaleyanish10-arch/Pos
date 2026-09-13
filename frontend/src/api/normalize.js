import { useEffect, useState } from 'react';

export function shortId(id) {
  if (!id) return '#----';
  if (id.startsWith('#')) return id;
  return `#${id.slice(0, 5).toUpperCase()}`;
}

export function elapsedFrom(iso) {
  if (!iso) return '0 min';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '0 min';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  return `${mins} min`;
}

/** Parse '18 min' / '1 hr 5 min' / '45 min ago' into whole minutes (0 if unparseable). */
export function elapsedMinutes(elapsed) {
  const s = String(elapsed || '').toLowerCase();
  const hr = /([\d.]+)\s*hr/.exec(s);
  const min = /([\d.]+)\s*min/.exec(s);
  if (!hr && !min) return 0;
  return Math.round(parseFloat(hr ? hr[1] : min[1]) * (hr ? 60 : 1));
}

export const SLA_MINUTES = 15;

export const isOverSLA = (elapsed) => elapsedMinutes(elapsed) > SLA_MINUTES;

/**
 * Re-render every `intervalMs` so relative times ('12 min') stay live on kitchen boards.
 * Pass null to pause. Returns the tick so components can use it as an effect dependency.
 */
export function useElapsedClock(intervalMs = 30000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs == null) return;
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

export function normalizeTicket(t) {
  return {
    ...t,
    id: t.id,
    type: t.type || 'dine-in',
    ai: !!t.ai_phone,
    ai_phone: t.ai_phone,
    linked: !!t.linked_ticket_id,
    allergy: t.allergy || '',
    elapsed: t.elapsed || elapsedFrom(t.created_at),
    status: t.status || 'incoming',
    station: t.station || 'Kitchen',
    items: t.items || []
  };
}