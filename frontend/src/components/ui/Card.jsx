export function Card({
  children,
  className = '',
  padded = true,
  elevated = false,
  as: Tag = 'div'
}) {
  // One padding step (p-5, 24 on desktop). The old p-6 lg:p-7 double-step made
  // every nested panel read as a card-in-card — compose plain content instead.
  return (
    <Tag
      className={`rounded-card border border-line bg-surface ${elevated ? 'shadow-card' : ''} ${padded ? 'p-5 lg:p-6' : ''} ${className}`}>
      
      {children}
    </Tag>);

}

export function SectionHeader({ index, title, descriptor }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        {index && <span className="font-mono text-sm text-meta">{index}</span>}
        <h2 className="text-base font-bold tracking-tight text-ink">
          {title}
        </h2>
      </div>
      {descriptor &&
      <span className="text-caption font-medium text-meta">
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

}export function Shelf({
  children,
  className = ''



}) {
  // Alias of Card so the two wrappers can't drift apart visually again.
  return (
    <div
      className={`rounded-card border border-line bg-surface p-5 lg:p-6 ${className}`}>
      
      {children}
    </div>);
}
