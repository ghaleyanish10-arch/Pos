export function StatCard({ label, value, meta }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">
        {value}
      </p>
      {meta && <p className="mt-0.5 text-xs text-meta">{meta}</p>}
    </div>);

}

export function StatRow({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) =>
      <StatCard key={s.label} {...s} />
      )}
    </div>);

}
