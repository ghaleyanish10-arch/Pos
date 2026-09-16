export function MobileFrame({
  children,
  label,
  height = 560
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[320px] rounded-[36px] border-[10px] border-ink bg-surface p-0 shadow-pop">
        <div className="flex h-6 items-center justify-center">
          <span className="h-1.5 w-16 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div
          className="scroll-thin relative overflow-y-auto rounded-b-[26px] bg-canvas px-4 pb-6 pt-2"
          style={{ height }}>
          {children}
        </div>
      </div>
      {label &&
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-meta">
          {label}
        </span>
      }
    </div>);

}
