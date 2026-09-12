const toneText = {
  blue: 'text-status-blue bg-tint-blue',
  amber: 'text-status-amber bg-tint-amber',
  green: 'text-status-green bg-tint-green',
  red: 'text-status-red bg-tint-red',
  purple: 'text-status-purple bg-tint-purple',
  neutral: 'text-meta bg-canvas'
};

const dotColor = {
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  green: 'bg-status-green',
  red: 'bg-status-red',
  purple: 'bg-status-purple',
  neutral: 'bg-meta'
};

export function StatusDot({
  tone,
  className = ''
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor[tone]} ${className}`} />);


}

export function Pill({
  tone = 'neutral',
  dot = false,
  children,
  className = ''
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${toneText[tone]} ${className}`}>
      
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>);

}

export function AIBadge({ label = 'AI' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-purple px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-status-purple">
      <span className="h-2 w-2 rounded-full bg-status-purple" aria-hidden="true" />
      {label}
    </span>);

}

export function CountBadge({
  children,
  tone = 'neutral'
}) {
  return (
    <span
      className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 font-mono text-xs font-bold ${toneText[tone]}`}>
      
      {children}
    </span>);

}
