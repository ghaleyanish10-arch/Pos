import { AlertTriangleIcon } from 'lucide-react';

/** Soft red/pink full-width strip. The only alert affordance in the system. */
export function AlertBanner({
  children,
  action,
  icon,
  className = ''
}) {
  return (
    <div
      role="status"
      className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F3CFCC] bg-tint-red px-4 py-3 ${className}`}>
      
      <div className="flex items-center gap-2.5 text-sm font-semibold text-status-red">
        {icon ?? <AlertTriangleIcon className="h-4 w-4 shrink-0" />}
        <span>{children}</span>
      </div>
      {action}
    </div>);

}
