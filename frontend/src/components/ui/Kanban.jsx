import { Pill, StatusDot } from './Pill';

/**
 * Kitchen-board card anatomy — the canonical card for every board in the system.
 * header row (ID/name + tag pill + time/status) → 1-3 info lines → footer action row.
 */
export function BoardCard({
  id,
  tag,
  tagTone = 'neutral',
  right,
  rightTone,
  accent,
  banner,
  children,
  footer,
  badge
}) {
  const accentRing = {
    amber: 'border-status-amber',
    red: 'border-status-red',
    green: 'border-status-green',
    blue: 'border-status-blue',
    purple: 'border-status-purple',
    neutral: 'border-line'
  };
  return (
    <article
      className={`rounded-card border bg-surface p-4 ${accent ? accentRing[accent] : 'border-line'}`}>
      
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-bold text-ink">{id}</h3>
          {tag && <Pill tone={tagTone}>{tag}</Pill>}
          {badge}
        </div>
        {right &&
        <span
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${rightTone ? '' : 'text-meta'}`}>
          
            {rightTone && <StatusDot tone={rightTone} />}
            <span className={rightTone ? 'text-ink' : ''}>{right}</span>
          </span>
        }
      </div>
      {children && <div className="mt-2.5 space-y-1 text-sm text-ink">{children}</div>}
      {banner && <div className="mt-3">{banner}</div>}
      {footer && <div className="mt-3.5 flex items-center gap-2">{footer}</div>}
    </article>);

}

export function InfoLine({
  label,
  children
}) {
  return (
    <p className="text-sm leading-5">
      {label && <span className="text-meta">{label} </span>}
      <span className="text-ink">{children}</span>
    </p>);

}

export function Board({ children }) {
  return (
    <div className="scroll-thin grid gap-4 overflow-x-auto pb-2 lg:grid-flow-col lg:auto-cols-fr">
      {children}
    </div>);

}

export function Column({
  title,
  tone,
  count,
  action,
  children
}) {
  return (
    <section className="flex min-w-[280px] flex-col rounded-shelf border border-line bg-shelf p-3">
      <header className="mb-3 flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} />
          <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink">
            {title}
          </h2>
          <span className="font-mono text-xs font-bold text-meta">{count}</span>
        </div>
        {action}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>);

}
