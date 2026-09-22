/**
 * StationTabs — Kitchen / Bar / Dessert / Expo selector.
 * Segmented-control style: quiet when idle, solid charcoal when active.
 */
export function StationTabs({ stations, value, onChange }) {
  return (
    <div role="tablist" aria-label="Station" className="flex items-center gap-1 rounded-xl border border-line bg-canvas p-1">
      {stations.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(s)}
            className={`h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150 ease-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
              active ? 'bg-ink text-white shadow-xs' : 'text-meta hover:bg-surface hover:text-ink'
            }`}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

/**
 * StatusFilter — compact count chips (All / New / Cooking / Ready / Late).
 * These are filters, not decoration: click one to narrow the board.
 */
export function StatusFilter({ counts, value, onChange }) {
  const items = [
    { key: 'all', label: 'All', dot: 'bg-meta', n: counts.all },
    { key: 'new', label: 'New', dot: 'bg-status-blue', n: counts.new },
    { key: 'preparing', label: 'Cooking', dot: 'bg-status-amber', n: counts.preparing },
    { key: 'ready', label: 'Ready', dot: 'bg-status-green', n: counts.ready },
    { key: 'late', label: 'Late', dot: 'bg-status-red', n: counts.late }
  ];
  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => {
        const active = value === it.key;
        const dim = it.n === 0 && !active;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.key)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-13 font-semibold transition-colors duration-150 ease-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
              active
                ? it.key === 'late'
                  ? 'border-status-red/40 bg-tint-red text-status-red'
                  : 'border-ink bg-ink text-white'
                : dim
                  ? 'border-line bg-surface text-meta/60'
                  : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
            }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${active && it.key !== 'late' ? 'bg-white' : it.dot}`} aria-hidden="true" />
            {it.label}
            <span className={`font-mono text-xs ${active && it.key !== 'late' ? 'text-white/70' : 'text-meta'}`}>{it.n}</span>
          </button>
        );
      })}
    </div>
  );
}
