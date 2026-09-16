import { useEffect, useState } from 'react';
import { CheckCircle2Icon, MinusIcon, PackageSearchIcon, PlusIcon, PrinterIcon } from 'lucide-react';
import { PageHeader, SectionHeader, Shelf } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, FilterChips, SearchInput, inputClass } from '../components/ui/Controls';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useNotifications } from '../state/Notifications';
import { useSettings } from '../state/SettingsContext';
import { inventory as staticInventory, reorderSuggestions as staticSuggestions, stockLocations } from '../data/manage';
import api from '../api/client';

const LOW_STOCK_NOTIFIED = new Set();

function restockedLabel(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function toDisplayItem(item, staticById) {
  const s = staticById.get(item.name) || {};
  return {
    id: item.id || '',
    name: item.name,
    category: item.category || '',
    stock: Number(item.stock) || 0,
    capacity: Number(item.capacity) || 0,
    unit: item.unit || 'u',
    threshold: Number(item.threshold) || 0,
    supplier: item.supplier || '',
    restocked: restockedLabel(item.restocked_at),
    location: s.location || 'Main floor',
    estPrice: s.estPrice || 0
  };
}

function notifFor(item, extra) {
  return {
    type: 'stock',
    title: `${item.name} is low on stock`,
    body: `${extra ?? item.stock} ${item.unit} left — below the ${item.threshold} ${item.unit} threshold`
  };
}

function buildPo(kind, list, suggestions) {
  const source = list && list.length > 0 ? list : staticInventory;
  const suggList = suggestions && suggestions.length > 0 ? suggestions : staticSuggestions;
  let lines;
  if (kind === 'reorder') {
    lines = source
      .filter((i) => i.stock <= i.threshold)
      .map((i) => {
        const sugg = suggList.find((x) => x.name === i.name);
        return {
          name: i.name,
          unit: i.unit,
          supplier: i.supplier,
          price: i.estPrice || 0,
          qty: sugg ? parseFloat(sugg.quantity) : Math.round((i.capacity - i.stock) * 10) / 10
        };
      });
  } else {
    const inv = source.find((i) => i.name === kind);
    const sugg = suggList.find((x) => x.name === kind);
    lines = [{
      name: kind,
      unit: inv?.unit,
      supplier: inv?.supplier,
      price: inv?.estPrice || 0,
      qty: sugg ? parseFloat(sugg.quantity) : (inv ? Math.round((inv.capacity - inv.stock) * 10) / 10 : 1)
    }];
  }
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const due = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    lines,
    poNo: 'PO-1042',
    date,
    due,
    suppliers: [...new Set(lines.map((l) => l.supplier))].join(', ')
  };
}

function PoReceipt({ po }) {
  const { settings } = useSettings();
  const sub = po.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const vat = Math.round(sub * (Number(settings.taxRate) || 0) / 100);
  const total = Math.round(sub + vat);
  return (
    <div id="print-receipt" className="scroll-thin max-h-[68vh] overflow-y-auto bg-white p-8 font-mono text-[13px] leading-relaxed text-ink shadow-pop">
      <header className="text-center">
        <p className="text-xl font-extrabold tracking-[0.22em]">{settings.name.toUpperCase()}</p>
        <p className="mt-1 text-xs">{settings.businessName.toUpperCase()}</p>
        <p className="text-xs">{settings.address}, {settings.city} · {settings.phone}</p>
      </header>
      <hr className="my-5 border-t border-dashed border-ink/20" />
      <div className="flex items-start justify-between text-xs">
        <div>
          <p className="font-bold">Order to</p>
          <p className="mt-0.5">{po.suppliers}</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-bold">PURCHASE ORDER</p>
          <p className="mt-0.5">{po.poNo} · {po.date}</p>
          <p>Deliver by {po.due}</p>
        </div>
      </div>
      <hr className="my-4 border-t border-dashed border-ink/20" />
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-ink/20 text-left">
            <th className="pb-1.5 font-bold">#</th>
            <th className="pb-1.5 font-bold">Item</th>
            <th className="pb-1.5 text-right font-bold">Qty</th>
            <th className="pb-1.5 text-right font-bold">Rate</th>
            <th className="pb-1.5 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((l, i) => (
            <tr key={l.name} className="border-b border-line">
              <td className="py-2">{i + 1}</td>
              <td className="py-2">
                <p className="font-bold">{l.name}</p>
                <p className="text-[11px] text-meta">{l.supplier}</p>
              </td>
              <td className="py-2 text-right">{l.qty} {l.unit}</td>
              <td className="py-2 text-right">Rs {l.price}/{l.unit}</td>
              <td className="py-2 text-right font-bold">Rs {Math.round(l.qty * l.price).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-56 space-y-1 text-xs">
        <div className="flex justify-between"><span>Subtotal</span><span>Rs {Math.round(sub).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>{settings.taxName} {settings.taxRate}%</span><span>Rs {vat.toLocaleString()}</span></div>
        <div className="mt-1 flex justify-between border-t border-ink/20 pt-1 text-sm font-extrabold"><span>TOTAL</span><span>Rs {total.toLocaleString()}</span></div>
      </div>
      <hr className="my-5 border-t border-dashed border-ink/20" />
      <p className="text-xs">Notes: Deliver between 8–10 am with temperature log. Confirm quantity on arrival.</p>
      <div className="mt-8 flex justify-between text-xs">
        <span>Authorized by&nbsp; ____________</span>
        <span>Received by&nbsp; ____________</span>
      </div>
    </div>
  );
}

export function Inventory() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [delta, setDelta] = useState(0);
  const [stock, setStock] = useState(staticInventory);
  const [suggestions, setSuggestions] = useState(staticSuggestions);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [countOpen, setCountOpen] = useState(false);
  const [countStep, setCountStep] = useState(1);
  const [countLocation, setCountLocation] = useState(null);
  const [counts, setCounts] = useState({});
  const [po, setPo] = useState(null);
  const { add } = useNotifications();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [invRes, sugRes] = await Promise.all([
          api('/inventory'),
          api('/inventory/reorder-suggestions')
        ]);
        if (cancelled) return;
        const staticById = new Map(staticInventory.map((i) => [i.name, i]));
        const apiItems = invRes?.data || [];
        const apiSugs = sugRes?.data || [];
        if (apiItems.length > 0) {
          setStock(apiItems.map((i) => toDisplayItem(i, staticById)));
          setSuggestions(apiSugs.map((s) => {
            const match = apiItems.find((i) => i.name === s.name);
            return {
              id: s.name,
              name: s.name,
              quantity: `${s.quantity} ${match?.unit || ''}`.trim(),
              note: s.note
            };
          }));
        }
        setLoading(false);
      } catch {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    stock
      .filter((i) => i.stock <= i.threshold && !LOW_STOCK_NOTIFIED.has(i.name))
      .forEach((i) => {
        LOW_STOCK_NOTIFIED.add(i.name);
        add(notifFor(i));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifyIfLow = (itemName, qty) => {
    const item = stock.find((i) => i.name === itemName);
    if (!item || qty > item.threshold || LOW_STOCK_NOTIFIED.has(itemName)) return;
    LOW_STOCK_NOTIFIED.add(itemName);
    add(notifFor(item, `${qty}`));
  };

  const rows = stock.filter((i) =>
  i.name.toLowerCase().includes(query.toLowerCase())
  );

  const lowCount = stock.filter((i) => i.stock <= i.threshold).length;

  function openStockCount() {
    setCountStep(1);
    setCountLocation(null);
    setCounts({});
    setCountOpen(true);
  }

  function setItem(name, val) {
    setCounts((p) => ({ ...p, [name]: val }));
  }

  const locationItems = countLocation
  ? stock.filter((i) => i.location === countLocation)
  : [];

  const countRows = locationItems.map((item) => {
    const counted = counts[item.name];
    const diff = counted !== undefined ? counted - item.stock : 0;
    return { ...item, counted, diff };
  });

  const itemsCounted = countRows.filter((r) => r.counted !== undefined).length;
  const totalAbsDiff = countRows.reduce((s, r) => s + Math.abs(r.diff), 0);
  const moneyEstimate = countRows.reduce(
    (s, r) => s + Math.abs(r.diff) * (r.estPrice || 0),
    0
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Inventory" descriptor={`${loading ? 'Loading…' : `${stock.length} tracked items · ${lowCount} below threshold`}`}>
        <SearchInput
          className="w-[240px]"
          placeholder="Search items"
          value={query}
          onChange={setQuery} />
        
        <Button variant="dark" onClick={openStockCount}>New stock count</Button>
      </PageHeader>

      {lowCount === 0 ? (
        <div
          role="status"
          className="mb-6 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-status-green/30 bg-tint-green px-4 py-3">
          
          <div className="flex items-center gap-2.5 text-sm font-semibold text-status-green">
            <CheckCircle2Icon className="h-4 w-4 shrink-0" />
            <span>Inventory is full — every item is above its reorder point, nothing to reorder.</span>
          </div>
        </div>
      ) : (
        <AlertBanner
          className="mb-6"
          action={
            <Button size="sm" variant="red" onClick={() => setPo(buildPo('reorder', stock, suggestions))}>
              Reorder now
            </Button>
          }>
          
          {`${lowCount} ${lowCount === 1 ? 'item' : 'items'} low — ${stock.filter((i) => i.stock <= i.threshold).slice(0, 3).map((i) => i.name).join(', ')}`}
        </AlertBanner>
      )}

      <section className="mb-7">
        <SectionHeader
          index="01"
          title="Suggested reorder"
          descriptor="Predictive · 14-day velocity" />
        
        <Shelf>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {suggestions.length === 0 &&
            <div className="col-span-full rounded-xl border border-line bg-canvas p-5 text-sm text-meta">
                No items are below their reorder threshold right now.
              </div>
            }
            {suggestions.map((s) =>
            <div
              key={s.name}
              className="flex flex-col rounded-xl border border-line bg-canvas p-4">
              
                <h3 className="text-[17px] font-bold text-ink">{s.name}</h3>
                <p className="mt-0.5 font-mono text-2xl font-extrabold text-ink">
                  {s.quantity}
                </p>
                <p className="mt-1 text-xs text-meta">{s.note}</p>
                <div className="mt-auto pt-4">
                  <Button size="sm" variant="dark" onClick={() => setPo(buildPo(s.name, stock, suggestions))}>
                    Add to PO
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Shelf>
      </section>

      <SectionHeader index="02" title="Stock on hand" descriptor="Live count" />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Category</Th>
              <Th>Current stock</Th>
              <Th>Reorder at</Th>
              <Th>Status</Th>
              <Th>Supplier</Th>
              <Th>Last restocked</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const low = item.stock <= item.threshold;
              const out = item.stock <= 0;
              return (
                <Tr key={item.name} className={low ? 'bg-tint-red/60' : ''}>
                  <Td className="font-semibold">{item.name}</Td>
                  <Td className="text-sm text-meta">{item.category}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="w-20 font-mono text-sm font-bold">
                        {item.stock} {item.unit}
                      </span>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                        <span
                          className={`block h-full rounded-full ${low ? 'bg-status-red' : 'bg-status-green'}`}
                          style={{
                            width: `${Math.max(4, Math.min(100, item.stock / item.capacity * 100))}%`
                          }} />
                      </span>
                    </div>
                  </Td>
                  <Td className="font-mono text-sm text-meta">
                    {item.threshold} {item.unit}
                  </Td>
                  <Td>
                    {out ? (
                      <Pill tone="red" dot>Out of stock</Pill>
                    ) : low ? (
                      <Pill tone="amber" dot>Low stock</Pill>
                    ) : (
                      <Pill tone="green" dot>In stock</Pill>
                    )}
                  </Td>
                  <Td className="text-sm">{item.supplier}</Td>
                  <Td className="text-sm text-meta">{item.restocked}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActive(item);
                        setDelta(0);
                      }}>
                      Adjust
                    </Button>
                  </Td>
                </Tr>);
            })}
            {rows.length === 0 &&
            <Tr>
                <Td colSpan={8}>
                  <EmptyState
                    compact
                    tone="amber"
                    icon={<PackageSearchIcon className="h-6 w-6" />}
                    title="No items found"
                    description={`Nothing matches "${query}" in stock on hand.`}
                    action={
                      <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                        Clear search
                      </Button>
                    } />
                </Td>
              </Tr>
            }
          </tbody>
        </Table>
      </TableWrap>

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? `Adjust ${active.name}` : ''}
        subtitle={active ? `${active.stock} ${active.unit} on hand · ${active.supplier}` : ''}
        footer={
        <>
            <Button variant="outline" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              variant="green" full
              onClick={() => {
                notifyIfLow(active.name, active.stock + delta);
                const next = Math.max(0, Math.round((active.stock + delta) * 10) / 10);
                setStock((p) => p.map((i) =>
                  i.name === active.name
                    ? { ...i, stock: next, restocked: 'Just now' }
                    : i
                ));
                toast(`${active.name} adjusted to ${next.toFixed(1)} ${active.unit}`, { tone: 'green' });
                if (active.id) {
                  api(`/inventory/${active.id}/adjust`, { method: 'PUT', body: { delta } }).catch(() => {});
                }
                setActive(null);
              }}>
              Save adjustment
            </Button>
          </>
        }>
        
        {active &&
        <div className="space-y-5">
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                New quantity
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                type="button"
                aria-label="Decrease"
                onClick={() => setDelta((d) => d - 1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="flex-1 text-center font-mono text-3xl font-extrabold text-ink">
                  {(active.stock + delta).toFixed(1)}
                  <span className="ml-1 text-base text-meta">{active.unit}</span>
                </span>
                <button
                type="button"
                aria-label="Increase"
                onClick={() => setDelta((d) => d + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-meta">
                {delta >= 0 ? '+' : ''}
                {delta} {active.unit} from current count
              </p>
            </div>

            <Field label="Reason">
              <select className={inputClass} defaultValue="Restock">
                <option>Restock</option>
                <option>Waste / spoilage</option>
                <option>Correction</option>
                <option>Staff meal</option>
              </select>
            </Field>

            <Field label="Note (optional)">
              <textarea
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
              placeholder="Delivery short by 2 kg — noted with supplier" />
            
            </Field>

            <p className="text-xs text-meta">
              Every adjustment is written to the audit trail with your name and role.
            </p>
          </div>
        }
      </Drawer>

      <Drawer
        open={countOpen}
        onClose={() => setCountOpen(false)}
        title={countStep === 3 ? 'Stock count summary' : 'New stock count'}
        subtitle={
          countStep === 1
            ? 'Select location'
            : countStep === 2
              ? `${countLocation} · ${locationItems.length} items`
              : `${countLocation} · ${itemsCounted} of ${locationItems.length} counted`
        }
        footer={
        <>
            {countStep > 1 && (
              <Button variant="outline" onClick={() => setCountStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {countStep < 3 && (
              <Button
                variant="dark"
                full
                disabled={countStep === 1 && !countLocation}
                onClick={() => setCountStep((s) => s + 1)}>
                Next
              </Button>
            )}
            {countStep === 3 && (
              <Button
                variant="green"
                full
                onClick={() => {
                  toast(`Stock count submitted · ${locationItems.length} items · variance Rs ${moneyEstimate.toLocaleString()}`, { tone: 'green' });
                  countRows.forEach((r) => {
                    if (r.counted !== undefined) notifyIfLow(r.name, r.counted);
                    if (r.counted !== undefined && r.id) {
                      api(`/inventory/${r.id}/adjust`, { method: 'PUT', body: { delta: r.counted - r.stock } }).catch(() => {});
                    }
                  });
                  setStock((p) => p.map((i) => {
                    const c = counts[i.name];
                    return c !== undefined ? { ...i, stock: c, restocked: 'Just now' } : i;
                  }));
                  setCountOpen(false);
                }}>
                Submit count
              </Button>
            )}
          </>
        }>
        
        {countStep === 1 &&
        <div className="space-y-5">
            <p className="text-sm text-meta">
              Choose the location you want to count stock for.
            </p>
            <FilterChips
              ariaLabel="Location"
              options={stockLocations}
              value={countLocation}
              onChange={setCountLocation} />
          </div>
        }

        {countStep === 2 &&
        <div className="space-y-2">
            {countRows.map((item) => {
              const isSet = item.counted !== undefined;
              const hasDiff = isSet && item.diff !== 0;
              return (
                <div
                  key={item.name}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  hasDiff
                    ? 'border-status-red/30 bg-tint-red/40'
                    : isSet
                      ? 'border-status-green/30 bg-tint-green/40'
                      : 'border-line bg-canvas'}`
                  }>
                  
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {item.name}
                      </p>
                      <p className="text-xs text-meta">
                        System: {item.stock} {item.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Decrease count"
                      onClick={() => setItem(item.name, (counts[item.name] ?? item.stock) - 1)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
                      
                      <MinusIcon className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-14 text-center font-mono text-sm font-bold text-ink">
                      {isSet ? item.counted : '—'}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase count"
                      onClick={() => setItem(item.name, (counts[item.name] ?? item.stock) + 1)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
                      
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                    {isSet &&
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                      hasDiff
                        ? 'bg-tint-red text-status-red'
                        : 'bg-tint-green text-status-green'}`
                      }>
                      
                        {item.diff === 0 ? '0' : (item.diff > 0 ? `+${item.diff}` : item.diff)}
                      </span>
                    }
                  </div>
                );
            })}
          </div>
        }

        {countStep === 3 &&
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Items counted
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                  {itemsCounted}
                  <span className="ml-1 text-sm text-meta">/ {locationItems.length}</span>
                </p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Total variance
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                  {totalAbsDiff}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Estimated variance value
              </p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                Rs {moneyEstimate.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              {countRows.filter((r) => r.counted !== undefined).map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2">
                  
                  <span className="text-sm font-semibold text-ink">{r.name}</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                    r.diff === 0
                      ? 'text-status-green'
                      : 'text-status-red'}`
                    }>
                    
                    {r.diff === 0 ? '0' : (r.diff > 0 ? `+${r.diff}` : r.diff)} {r.unit}
                  </span>
                </div>
              ))}
            </div>

            {itemsCounted === 0 &&
            <p className="text-center text-sm text-meta">
              No items counted yet. Go back to count items.
            </p>
            }
          </div>
        }
      </Drawer>

      {po &&
      <div className="print-veil fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
          <div className="flex w-full max-w-[520px] flex-col gap-4">
            <PoReceipt po={po} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPo(null)}>Close</Button>
              <Button variant="dark" onClick={() => window.print()}>
                <PrinterIcon className="h-4 w-4 mr-2" /> Print receipt
              </Button>
            </div>
          </div>
        </div>
      }
    </div>);

}
