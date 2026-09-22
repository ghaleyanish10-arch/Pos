import { CheckIcon, Undo2Icon } from 'lucide-react';
import { LATE, statusOf, tableLabel, typeLabel, parseLine } from './kdsTokens';
import { OrderStatusBadge, Timer, Modifier } from './OrderStatusBadge';

/**
 * OrderCard — one ticket on the line.
 *
 * Hierarchy (top → bottom): order number + table locator → status + timer →
 * food items (the scan target) → notes/allergy → actions. A thin accent line
 * on top carries the status colour; the card body stays white so food reads
 * first. The timer is prominent but subordinate to the order number.
 */
export function OrderCard({ t, age, slaSecs, primary, onRecall }) {
  const s = statusOf(t);
  const late = age >= slaSecs;
  const status = late ? LATE : s;
  const lines = (t.items || []).map(parseLine);
  const hasNote = Boolean(t.notes || t.allergy || (t.modifiers || []).length);

  const itemTone = late
    ? 'border-t-status-red'
    : status.accent === 'bg-status-amber'
      ? 'border-t-status-amber'
      : status.accent === 'bg-status-green'
        ? 'border-t-status-green'
        : 'border-t-status-blue';

  return (
    <article
      className={`flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs ${itemTone} border-t-2 ${
        late ? 'border-status-red/50' : ''
      }`}>
      {/* header: identity first — number, locator, type */}
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-lg font-bold tracking-tight text-ink">{t.id?.slice(0, 6) || t.id}</p>
          <p className="mt-0.5 flex items-center gap-2 text-13 font-semibold text-ink">
            {tableLabel(t)}
            <span className="font-medium text-meta">· {typeLabel(t)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <OrderStatusBadge ticket={t} late={late} />
          <Timer age={age} slaSecs={slaSecs} />
        </div>
      </header>

      <div className={`mt-3 h-px w-full ${status.accent} opacity-40`} aria-hidden="true" />

      {/* items — the scan target. 15px so a cook reads from arm's length. */}
      <ul className="flex-1 space-y-1.5 px-4 py-3">
        {lines.map((line, i) => (
          <li key={`${line.name}-${i}`} className="flex items-baseline gap-2.5">
            <span className="w-7 shrink-0 text-right font-mono text-15 font-bold tabular-nums text-ink">
              {line.qty}×
            </span>
            <span className="min-w-0 flex-1 text-15 font-semibold leading-snug text-ink">{line.name}</span>
          </li>
        ))}
        {hasNote && (
          <li className="space-y-0.5 pt-1.5">
            {(t.modifiers || []).map((m) => (
              <Modifier key={m}>{m}</Modifier>
            ))}
            {t.notes && <Modifier>{t.notes}</Modifier>}
            {t.allergy && <Modifier allergy>{t.allergy}</Modifier>}
          </li>
        )}
      </ul>

      {/* actions: recall secondary · complete primary. 48px touch targets. */}
      <footer className="grid grid-cols-[1fr_1.6fr] gap-2 border-t border-line bg-canvas/60 p-2.5">
        <button
          type="button"
          onClick={onRecall}
          className="flex h-12 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
          <Undo2Icon className="h-4 w-4" aria-hidden="true" />
          Recall
        </button>
        <button
          type="button"
          onClick={primary.run}
          className={`flex h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-white transition-colors duration-150 ease-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
            primary.tone === 'green'
              ? 'bg-status-green hover:bg-status-green/90'
              : primary.tone === 'amber'
                ? 'bg-status-amber hover:bg-status-amber/90'
                : 'bg-ink hover:bg-ink/90'
          }`}>
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
          {primary.label}
        </button>
      </footer>
    </article>
  );
}
