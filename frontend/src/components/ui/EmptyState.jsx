import { InboxIcon, Loader2Icon } from 'lucide-react';

const toneBubble = {
  neutral: 'border-line bg-canvas text-meta',
  blue: 'border-status-blue/20 bg-tint-blue text-status-blue',
  amber: 'border-status-amber/20 bg-tint-amber text-status-amber',
  green: 'border-status-green/20 bg-tint-green text-status-green',
  red: 'border-status-red/20 bg-tint-red text-status-red',
  purple: 'border-status-purple/20 bg-tint-purple text-status-purple'
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  compact = false,
  loading = false,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10' : 'py-20'} ${className}`}>
      <span
        aria-hidden="true"
        className={`flex h-14 w-14 items-center justify-center rounded-full border ${toneBubble[tone]}`}>
        {loading
          ? <Loader2Icon className="h-6 w-6 animate-spin" />
          : icon ?? <InboxIcon className="h-6 w-6" />}
      </span>
      {title && (
        <h3 className="mt-4 text-base font-extrabold tracking-tight text-ink">{title}</h3>
      )}
      {description && (
        <p className="mt-1 max-w-[340px] text-sm text-meta">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>);

}