export function Card({
  children,
  className = '',
  padded = true,
  as: Tag = 'div'
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface ${padded ? 'p-6 lg:p-7' : ''} ${className}`}>
      
      {children}
    </Tag>);

}

export function SectionHeader({ index, title, descriptor }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-meta">{index}</span>
        <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
          {title}
        </h2>
      </div>
      {descriptor &&
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-meta">
          {descriptor}
        </span>
      }
    </div>);

}

export function PageHeader({ title, descriptor, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {title}
        </h1>
        {descriptor &&
        <p className="mt-1 text-sm text-meta">{descriptor}</p>
        }
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>);

}

export function Shelf({
  children,
  className = ''



}) {
  return (
    <div
      className={`rounded-shelf border border-line bg-surface p-5 lg:p-6 ${className}`}>
      
      {children}
    </div>);

}
