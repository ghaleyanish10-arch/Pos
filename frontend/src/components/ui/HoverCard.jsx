import { useState, useRef, useEffect } from 'react';

export function HoverCard({ children, content, delay = 200 }) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef(null);
  const ref = useRef(null);

  const show = () => {
    timeout.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timeout.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => clearTimeout(timeout.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setVisible(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [visible]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}>
      {children}
      {visible && content && (
        <div
          className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface p-4 shadow-pop"
          onMouseEnter={() => clearTimeout(timeout.current)}
          onMouseLeave={hide}>
          {content}
        </div>
      )}
    </div>
  );
}

export function HoverCardContent({ name, role, subtitle, status, stats = [] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold text-ink">
          {name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-meta">{role}</p>
        </div>
        {status && (
          <span className={`ml-auto h-2.5 w-2.5 rounded-full ${status === 'active' ? 'bg-status-green' : 'bg-meta/40'}`} />
        )}
      </div>
      {subtitle && <p className="text-xs text-meta">{subtitle}</p>}
      {stats.length > 0 && (
        <div className="flex gap-4 pt-2 border-t border-line">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-meta">{s.label}</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-ink">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}