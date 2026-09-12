import { SearchIcon } from 'lucide-react';

export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel




}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`h-8 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
            active ?
            'border-ink bg-ink text-white' :
            'border-line bg-surface text-meta hover:text-ink'}`
            }>
            
            {opt}
          </button>);

      })}
    </div>);

}

export function Tabs({
  options,
  value,
  onChange,
  counts,
  danger




}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line">
      {options.map((opt) => {
        const active = opt === value;
        const isDanger = danger === opt;
        return (
          <button
            key={opt}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(opt)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 pb-2.5 pt-2 text-sm font-semibold transition-colors duration-150 ease-soft ${
            active ?
            isDanger ?
            'border-status-red text-status-red' :
            'border-ink text-ink' :
            `border-transparent hover:text-ink ${isDanger ? 'text-status-red/70' : 'text-meta'}`}`
            }>
            
            {opt}
            {counts?.[opt] !== undefined &&
            <span className="font-mono text-xs text-meta">{counts[opt]}</span>
            }
          </button>);

      })}
    </div>);

}

export function SearchInput({
  placeholder,
  value,
  onChange,
  className = ''




}) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
      
    </div>);

}

export function Toggle({
  checked,
  onChange,
  label




}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 ease-soft ${
      checked ? 'border-status-green bg-status-green' : 'border-line bg-canvas'}`
      }>
      
      <span
        className={`absolute top-0.5 rounded-full bg-white shadow-sm transition-all duration-150 ease-soft ${
        checked ? 'left-[22px]' : 'left-[3px]'}`
        }
        style={{ height: 18, width: 18 }} />
      
    </button>);

}

export function GhostCard({
  label,
  onClick,
  className = ''




}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line bg-transparent p-4 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink ${className}`}>
      
      <span className="text-xl leading-none">+</span>
      {label}
    </button>);

}

export function Field({
  label,
  children




}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
        {label}
      </span>
      {children}
    </label>);

}

export const inputClass =
'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none';
