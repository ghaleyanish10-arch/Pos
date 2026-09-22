/**
 * Nepal payment-gateway tiles — Restronp-style recognition over abstraction:
 * staff and customers know eSewa green, Khalti purple and IME Pay orange on
 * sight, so each tile carries its brand mark/color instead of a generic icon.
 * Cash and Card stay neutral ink.
 */
export const GATEWAYS = [
  { key: 'cash', label: 'Cash', color: '#1f2937', mark: 'रू', light: '#f3f4f6' },
  { key: 'card', label: 'Card', color: '#1f2937', mark: '▤', light: '#f3f4f6' },
  { key: 'esewa', label: 'eSewa', color: '#60BB46', mark: 'eS', light: '#EAF7E5' },
  { key: 'khalti', label: 'Khalti', color: '#5C2D91', mark: 'Kh', light: '#F0EAF7' },
  { key: 'imepay', label: 'IME Pay', color: '#F58220', mark: 'IME', light: '#FEF0E3' }
];

export function GatewayTiles({ value, onChange, disabled = false, compact = false }) {
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {GATEWAYS.map((g) => {
        const active = value === g.label;
        return (
          <button
            key={g.key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(g.label)}
            className={`flex items-center gap-2 rounded-xl border px-3 transition-colors duration-150 ease-soft disabled:opacity-50 ${
              compact ? 'h-11' : 'h-14'
            } ${active ? 'border-transparent text-white shadow-pop' : 'border-line bg-canvas text-ink hover:border-ink/30'}`}
            style={active ? { backgroundColor: g.color } : undefined}>
            <span
              className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-micro font-black ${
                active ? 'bg-white/20 text-white' : 'text-white'
              }`}
              style={active ? undefined : { backgroundColor: g.color }}>
              {g.mark}
            </span>
            <span className="truncate text-sm font-bold">{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}
