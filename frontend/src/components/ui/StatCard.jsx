export function StatCard({ label, value, meta, icon }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-13 font-semibold text-meta">{label}</p>
        {icon || null}
      </div>
      <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-ink">
        {value}
      </p>
      {meta && <p className="mt-1 text-caption font-medium text-meta">{meta}</p>}
    </div>
  );
}

export function StatRow({ stats, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${className}`}>
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
}