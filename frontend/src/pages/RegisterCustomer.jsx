import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MinusIcon, PlusIcon, SearchIcon, ShoppingBagIcon, XIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useMenu } from '../state/MenuContext';
import { useSettings } from '../state/SettingsContext';

const DEVICES = [
  { key: 'desktop', label: 'Desktop', width: null },
  { key: 'tablet', label: 'Tablet', width: 768 },
  { key: 'phone', label: 'Phone', width: 390 }
];

const toNum = (price) => Number(String(price).replace(/\D/g, ''));
const fmt = (n) => 'Rs ' + n.toLocaleString('en-IN');

export function RegisterCustomer() {
  const [params] = useSearchParams();
  const device = params.get('device') || 'desktop';
  const framed = DEVICES.find((d) => d.key === device)?.width || null;
  const { settings } = useSettings();
  const { items: menuItems, categories } = useMenu();
  const toast = useToast();

  const [category, setCategory] = useState('All items');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const catKeys = categories.length > 0 ? categories : ['All items'];

  const items = menuItems.filter((i) => {
    const inCat = category === 'All items' || i.category === category;
    const inQuery = !query.trim() || i.name.toLowerCase().includes(query.toLowerCase());
    return inCat && inQuery;
  });

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + l.qty * toNum(l.price), 0);
  const qtyOf = (name) => cart.find((l) => l.name === name)?.qty ?? 0;

  const add = (item) =>
    setCart((c) => {
      const e = c.find((l) => l.name === item.name);
      if (e) return c.map((l) => (l.name === item.name ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { name: item.name, price: toNum(item.price), category: item.category, qty: 1 }];
    });

  const inc = (name) => setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty + 1 } : l)));
  const dec = (name) =>
    setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0));

  const placeOrder = () => {
    toast(`Order received · ${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}`, { tone: 'green' });
    setCart([]);
    setCartOpen(false);
  };

  const store = (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur">
        <div>
          <p className="text-base font-extrabold text-ink">{settings.businessName}</p>
          <p className="text-xs text-meta">{settings.city} · 20 min delivery</p>
        </div>
        <Pill tone="green" dot>
          Open
        </Pill>
      </div>

      <div className="relative mt-2">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          aria-label="Search menu"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
      </div>

      <div className="scroll-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {catKeys.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
              }`}>
              {c}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2.5 pb-20">
        {items.length === 0 && (
          <EmptyState
            compact
            icon={<SearchIcon className="h-6 w-6" />}
            title="Nothing matches"
            description="Try another category or search term."
          />
        )}
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
            {item.photo ? (
              <img src={item.photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-bold text-meta ring-1 ring-line">
                {item.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{item.name}</p>
              <p className="font-mono text-xs text-meta">{item.price}</p>
            </div>
            {qtyOf(item.name) > 0 ? (
              <div className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-canvas p-1">
                <button
                  type="button"
                  aria-label={`Fewer ${item.name}`}
                  onClick={() => dec(item.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors duration-150 ease-soft hover:bg-line/60">
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="w-4 text-center text-sm font-bold text-ink">{qtyOf(item.name)}</span>
                <button
                  type="button"
                  aria-label={`More ${item.name}`}
                  onClick={() => inc(item.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors duration-150 ease-soft hover:bg-line/60">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Add ${item.name}`}
                onClick={() => {
                  add(item);
                  toast(`${item.name} added`, { tone: 'green' });
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-colors duration-150 ease-soft hover:opacity-90">
                <PlusIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {count > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-auto bg-canvas/95 pb-2 pt-2 backdrop-blur">
          <button
            type="button"
            aria-label="View cart"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white transition-opacity duration-150 ease-soft hover:opacity-90">
            <span className="flex items-center gap-2">
              <ShoppingBagIcon className="h-4 w-4" />
              {count} item{count === 1 ? '' : 's'}
            </span>
            <span>{fmt(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/online-store"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
          <XIcon className="h-4 w-4" />
          Back to online store
        </Link>
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          {DEVICES.map((d) => (
            <Link
              key={d.key}
              to={`/register/customer?device=${d.key}`}
              aria-pressed={device === d.key}
              className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                device === d.key ? 'bg-ink text-white' : 'text-meta hover:text-ink'
              }`}>
              {d.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        {framed ? (
          <div
            className="rounded-[36px] border-[10px] border-ink bg-surface shadow-pop"
            style={{ width: framed }}>
            <div className="flex h-6 items-center justify-center">
              <span className="h-1.5 w-16 rounded-full bg-line" aria-hidden="true" />
            </div>
            <div className="scroll-thin max-h-[640px] overflow-y-auto rounded-b-[26px] bg-canvas px-4 pb-4 pt-2">
              {store}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[520px] rounded-card border border-line bg-canvas p-4">
            {store}
          </div>
        )}
      </div>

      <Dialog
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Your order"
        subtitle={`${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}`}
        width="max-w-md"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCartOpen(false)}>
              Keep browsing
            </Button>
            <Button variant="green" full onClick={placeOrder} disabled={count === 0}>
              Request order
            </Button>
          </div>
        }>
        <div className="space-y-2">
          {cart.map((l) => (
            <div key={l.name} className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{l.name}</p>
                <p className="font-mono text-xs text-meta">{fmt(l.price)} each</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label={`Fewer ${l.name}`}
                  onClick={() => dec(l.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="w-4 text-center text-sm font-bold text-ink">{l.qty}</span>
                <button
                  type="button"
                  aria-label={`More ${l.name}`}
                  onClick={() => inc(l.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <span className="w-16 text-right font-mono text-sm font-bold text-ink">
                {fmt(l.price * l.qty)}
              </span>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}