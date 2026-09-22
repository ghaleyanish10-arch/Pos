import { useMemo, useState } from 'react';
import { MinusIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { GatewayTiles } from './GatewayTiles';

const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Split bill — one clear step, thumb-reachable, no wizard. Two modes:
 *   even  — big +/- stepper for guest count; per-guest shares listed live.
 *   items — tap items to cycle them between guests (color-coded chips).
 * Each segment picks its own payment method (gateway tiles), then "Charge
 * all segments" fires every split at once. Amber = segment pending,
 * green = segment charged — the same status language as the floor plan.
 */
export function SplitBill({ total, items = [], onCharge, busy = false }) {
  const [mode, setMode] = useState('even'); // even | items
  const [guests, setGuests] = useState(2);
  // items mode: itemId -> guest index (0..guests-1); unassigned = null
  const [assign, setAssign] = useState({});
  const [methods, setMethods] = useState({});

  const evenShare = total / Math.max(1, guests);

  const itemShares = useMemo(() => {
    const sums = Array(guests).fill(0);
    items.forEach((it) => {
      const g = assign[it.id];
      if (g !== undefined && g !== null) sums[g] += it.qty * it.price;
    });
    return sums;
  }, [items, assign, guests]);

  const unassigned = items.filter((it) => assign[it.id] === undefined || assign[it.id] === null);
  const assignedSum = itemShares.reduce((s, n) => s + n, 0);
  // Rounding remainder lands on guest 1 so segments always sum to the total.
  const shares = mode === 'even'
    ? Array.from({ length: guests }, (_, i) => (i === 0 ? total - evenShare * (guests - 1) : evenShare))
    : itemShares.map((s, i) => (i === 0 ? s + Math.max(0, total - assignedSum) : s));

  const cycle = (itemId) => {
    setAssign((a) => {
      const cur = a[itemId] ?? null;
      const next = cur === null ? 0 : cur + 1 >= guests ? null : cur + 1;
      return { ...a, [itemId]: next };
    });
  };

  const guestColors = ['#16a34a', '#d97706', '#dc2626', '#2563eb', '#7c3aed', '#0d9488'];

  // Indexed by guest position, not by share value: equal shares (the default
  // even split) are indistinguishable by amount, so indexOf would alias them.
  const allCharged = shares.every((_, i) => methods[i] !== undefined);
  const ready = mode === 'even' || unassigned.length === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl bg-canvas p-1">
        {[['even', 'Split evenly'], ['items', 'By items']].map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`h-8 rounded-lg text-13 font-bold transition-colors duration-150 ease-soft ${
              mode === m ? 'bg-surface text-ink shadow-sm' : 'text-meta hover:text-ink'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'even' ? (
        <div className="rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UsersIcon className="h-4 w-4 text-meta" /> Guests
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Fewer guests"
                onClick={() => setGuests((g) => Math.max(2, g - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                <MinusIcon className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-mono text-2xl font-extrabold text-ink">{guests}</span>
              <button
                type="button"
                aria-label="More guests"
                onClick={() => setGuests((g) => Math.min(6, g + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-meta">
            {rs(evenShare)} each · remainder rounds to guest 1
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-meta">Tap an item to cycle it between guests — {unassigned.length} unassigned.</p>
          {items.map((it) => {
            const g = assign[it.id] ?? null;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => cycle(it.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-soft ${
                  g === null ? 'border-line bg-canvas' : 'border-transparent'
                }`}
                style={g !== null ? { backgroundColor: `${guestColors[g % guestColors.length]}1a` } : undefined}>
                <span className="text-sm font-semibold text-ink">
                  {g !== null && (
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ backgroundColor: guestColors[g % guestColors.length] }} />
                  )}
                  {it.qty}× {it.name}
                </span>
                <span className="font-mono text-sm font-bold text-ink">{rs(it.qty * it.price)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {shares.map((share, i) => {
          const m = methods[i];
          const charged = m !== undefined;
          return (
            <div
              key={i}
              className={`rounded-xl border px-3 py-2.5 ${
                charged ? 'border-status-green/30 bg-tint-green' : 'border-status-amber/30 bg-tint-amber'
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ backgroundColor: guestColors[i % guestColors.length] }} />
                  Guest {i + 1}
                </span>
                <span className="font-mono text-sm font-extrabold text-ink">{rs(share)}</span>
              </div>
              {!charged ? (
                <div className="mt-2">
                  <GatewayTiles compact value={m || ''} onChange={(label) => setMethods((p) => ({ ...p, [i]: label }))} />
                </div>
              ) : (
                <p className="mt-1 text-xs font-semibold text-status-green">
                  {m} · {charged ? 'ready to charge' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button
        variant="dark"
        full
        disabled={busy || !ready || !allCharged}
        onClick={() =>
          onCharge(
            shares.map((s, i) => ({
              amount: s,
              method: methods[i],
              // by-items mode carries the item ids so each guest's receipt
              // lists exactly their dishes; even splits omit it.
              itemIds: mode === 'items'
                ? items.filter((it) => assign[it.id] === i).map((it) => it.id)
                : undefined
            }))
          )
        }>
        {busy
          ? 'Charging…'
          : !ready
            ? 'Assign every item first'
            : !allCharged
              ? 'Pick a method per guest'
              : `Charge ${guests} segments · ${rs(total)}`}
      </Button>
    </div>
  );
}
