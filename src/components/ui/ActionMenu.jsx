import { useState, useRef, useEffect } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';

export function ActionMenu({ actions = [], label = 'Actions', size = 'md' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const sizeClass = size === 'sm'
    ? 'h-7 w-7'
    : 'h-8 w-8';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        className={`flex items-center justify-center rounded-lg transition-colors duration-150 ease-soft text-meta hover:bg-canvas hover:text-ink ${sizeClass}`}>
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[180px] rounded-xl border border-line bg-surface shadow-pop py-1">
          {actions.map((action, i) => {
            if (action.divider) {
              return <div key={i} className="my-1 border-t border-line" />;
            }
            return (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.onClick?.();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ease-soft disabled:opacity-40 ${
                  action.danger
                    ? 'text-status-red hover:bg-tint-red'
                    : 'text-ink hover:bg-canvas'}`}>
                {action.icon && <span className="text-meta">{action.icon}</span>}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PageActionMenu({ actions = [], label = 'Page actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        className="flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[200px] rounded-xl border border-line bg-surface shadow-pop py-1">
          {actions.map((action, i) => {
            if (action.divider) {
              return <div key={i} className="my-1 border-t border-line" />;
            }
            return (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.onClick?.();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-soft disabled:opacity-40 ${
                  action.danger
                    ? 'text-status-red hover:bg-tint-red'
                    : 'text-ink hover:bg-canvas'}`}>
                {action.icon && <span className="text-meta">{action.icon}</span>}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}