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
            className={`chip ${
            active ?
            'border-ink bg-ink text-white' :
            'border-line bg-surface text-meta hover:border-ink/40 hover:text-ink'}`
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
  danger,
  ariaLabel


}) {
  const onKey = (e, i) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else next = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const tab = e.currentTarget.parentElement?.children[next];
    tab?.focus();
    onChange(options[next]);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1 border-b border-line">
      {options.map((opt, i) => {
        const active = opt === value;
        const isDanger = danger === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 pb-3 pt-2.5 text-sm font-semibold transition-colors duration-150 ease-soft ${
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
  inputRef,
  className = ''
}) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input pl-9" />

    </div>);

}

export function Toggle({
  checked,
  onChange,
  label,
  disabled


}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 ease-soft disabled:cursor-not-allowed disabled:opacity-50 ${
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
      <span className="field-label">
        {label}
      </span>
      {children}
    </label>);

}

export const inputClass = 'input';