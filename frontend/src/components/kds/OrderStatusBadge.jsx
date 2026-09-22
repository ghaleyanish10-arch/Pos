import { ClockIcon } from 'lucide-react';
import { LATE, SLA_WARN_RATIO, fmtTimer, statusOf } from './kdsTokens';

/**
 * OrderStatusBadge — dot + label, never colour alone (the label carries the
 * state for colour-blind cooks and glanceability).
 */
export function OrderStatusBadge({ ticket, late = false, className = '' }) {
  const s = late ? LATE : statusOf(ticket);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.border} ${s.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {late ? LATE.label : s.label}
    </span>
  );
}

/**
 * Timer — prominent but never louder than the order number.
 *   within SLA      → charcoal, plain
 *   ≥60% of SLA     → amber + "X min left"
 *   past SLA        → red + "Over X min"
 */
export function Timer({ age, slaSecs, className = '' }) {
  const ratio = slaSecs > 0 ? age / slaSecs : 0;
  const late = ratio >= 1;
  const warn = !late && ratio >= SLA_WARN_RATIO;
  const minsLeft = Math.ceil((slaSecs - age) / 60);
  return (
    <span className={`inline-flex flex-col items-end ${className}`}>
      <span
        aria-live={late ? 'assertive' : undefined}
        className={`font-mono text-xl font-bold tabular-nums leading-none ${
          late ? 'text-status-red' : warn ? 'text-status-amber' : 'text-ink'
        }`}>
        {fmtTimer(age)}
      </span>
      {late && (
        <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-status-red">
          <ClockIcon className="h-3 w-3" aria-hidden="true" />
          Over {Math.max(1, Math.ceil((age - slaSecs) / 60))} min
        </span>
      )}
      {warn && !late && (
        <span className="mt-0.5 text-xs font-medium text-status-amber">{minsLeft} min left</span>
      )}
    </span>
  );
}

/**
 * Modifier / note line — amber-ink for prep notes, red for allergies.
 */
export function Modifier({ children, allergy = false }) {
  return (
    <p
      className={`text-13 font-semibold leading-snug ${allergy ? 'text-status-red' : 'text-status-amber'}`}>
      {allergy && <span aria-label="Allergy">⚠ </span>}
      {children}
    </p>
  );
}
