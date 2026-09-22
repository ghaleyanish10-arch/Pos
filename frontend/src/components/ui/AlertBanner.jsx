import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from 'lucide-react';

const toneMap = {
  red: {
    wrap: 'border-tintBorder-red bg-tint-red',
    fg: 'text-status-red',
    icon: <AlertTriangleIcon className="h-4 w-4 shrink-0" />
  },
  amber: {
    wrap: 'border-tintBorder-amber bg-tint-amber',
    fg: 'text-status-amber',
    icon: <AlertTriangleIcon className="h-4 w-4 shrink-0" />
  },
  blue: {
    wrap: 'border-tintBorder-blue bg-tint-blue',
    fg: 'text-status-blue',
    icon: <InfoIcon className="h-4 w-4 shrink-0" />
  },
  green: {
    wrap: 'border-tintBorder-green bg-tint-green',
    fg: 'text-status-green',
    icon: <CheckCircleIcon className="h-4 w-4 shrink-0" />
  }
};

/** Soft tinted status strip. `tone` picks the color pair; defaults to red.
 *  Keep every call site on this instead of hand-rolled tint borders. */
export function AlertBanner({
  children,
  action,
  icon,
  tone = 'red',
  className = ''
}) {
  const t = toneMap[tone] || toneMap.red;
  return (
    <div
      role="status"
      className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${t.wrap} ${className}`}>
      
      <div className={`flex items-center gap-2.5 text-sm font-semibold ${t.fg}`}>
        {icon ?? t.icon}
        <span>{children}</span>
      </div>
      {action}
    </div>);

}