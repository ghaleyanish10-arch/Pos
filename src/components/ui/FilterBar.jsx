import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';

export function FilterBar({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {children}
    </div>
  );
}

export function FilterDropdown({ label, options, value, onChange }) {
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

  const display = value || label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 h-10 text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
        {display}
        <ChevronDownIcon className={`h-4 w-4 text-meta transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-line bg-surface shadow-pop py-1">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors duration-150 ease-soft ${
                opt === value ? 'bg-canvas font-semibold text-ink' : 'text-ink hover:bg-canvas'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterDateRange({ from, to, onFromChange, onToChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none" />
      <span className="text-xs text-meta">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none" />
    </div>
  );
}

export function FilterSearch({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-meta hover:text-ink">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
            opt === value
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}