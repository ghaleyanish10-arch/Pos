const toneText = {
  blue: 'text-status-blue bg-tint-blue border-tintBorder-blue',
  amber: 'text-status-amber bg-tint-amber border-tintBorder-amber',
  green: 'text-status-green bg-tint-green border-tintBorder-green',
  red: 'text-status-red bg-tint-red border-tintBorder-red',
  purple: 'text-status-purple bg-tint-purple border-tintBorder-purple',
  neutral: 'text-meta bg-canvas border-line'
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneText[tone]} ${className}`}>
      
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>);

}

export function AIBadge({ label = 'AI' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-tintBorder-purple bg-tint-purple px-2.5 py-0.5 text-xs font-bold text-status-purple">
      <span className="h-2 w-2 rounded-full bg-status-purple" aria-hidden="true" />
      {label}
    </span>);

}

const typeLabel = {
  dine: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery'
};

const typeTone = {
  dine: 'text-status-blue bg-tint-blue border-tintBorder-blue',
  takeaway: 'text-status-amber bg-tint-amber border-tintBorder-amber',
  delivery: 'text-status-green bg-tint-green border-tintBorder-green'
};

export function TypeBadge({ type = 'dine-in' }) {
  const key = String(type || '').toLowerCase().startsWith('take')
    ? 'takeaway'
    : String(type || '').toLowerCase().startsWith('deliv')
      ? 'delivery'
      : 'dine';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeTone[key]}`}>
      {typeLabel[key]}
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