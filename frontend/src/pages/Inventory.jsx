import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRightIcon,
  CheckCircle2Icon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  Trash2Icon,
  TriangleAlertIcon
} from 'lucide-react';
import { PageHeader, SectionHeader, Shelf } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, SearchInput, Tabs, inputClass } from '../components/ui/Controls';
import { StatRow } from '../components/ui/StatCard';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useSound } from '../state/SoundContext';
import { useNotifications } from '../state/Notifications';
import { useSettings } from '../state/SettingsContext';
import { inventory as staticInventory, reorderSuggestions as staticSuggestions } from '../data/manage';
import api, { getApiUser } from '../api/client';

const LOW_STOCK_NOTIFIED = new Set();

const WASTE_REASONS = ['Spoilage / expired', 'Broken / damaged', 'Over-prepped', 'Staff meal', 'Spill / handling'];

function restockedLabel(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// One exception tier per item — the whole UI is organized around these.
// out = stock 0 · critical = ≤25% of threshold (act today) · low = ≤ threshold
function tierOf(item) {
  if (item.stock <= 0) return 'out';
  if (item.threshold > 0 && item.stock <= item.threshold * 0.25) return 'critical';
  if (item.stock <= item.threshold) return 'low';
  return 'ok';
}

const TIER_ORDER = { out: 0, critical: 1, low: 2, ok: 3 };

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
    unitCost: Number(item.unit_cost) || s.estPrice || 0,
    restocked: restockedLabel(item.restocked_at),
    location: s.location || 'Main floor'
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
          price: i.unitCost || i.estPrice || 0,
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
      price: inv?.unitCost || inv?.estPrice || 0,
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
    <div id="print-receipt" className="scroll-thin max-h-[68vh] overflow-y-auto bg-white p-8 font-mono text-13 leading-relaxed text-ink shadow-pop">
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
          <p className="text-13 font-bold">PURCHASE ORDER</p>
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
                <p className="text-caption text-meta">{l.supplier}</p>
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
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { play } = useSound();

  // Exception tab: "Needs attention" is the default view — act first, browse later.
  const [tab, setTab] = useState('Needs attention');
  const [po, setPo] = useState(null);

  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteItem, setWasteItem] = useState(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState(WASTE_REASONS[0]);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferItem, setTransferItem] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [branchMap, setBranchMap] = useState({});
  const [branchNames, setBranchNames] = useState([]);

  const [posList, setPosList] = useState([]);
  const { add } = useNotifications();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [invRes, sugRes, sumRes, poRes, trRes, branchRes] = await Promise.all([
          api('/inventory'),
          api('/inventory/reorder-suggestions'),
          api('/inventory/summary'),
          api('/purchase-orders'),
          api('/transfers'),
          api('/branches')
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
        if (sumRes && !sumRes.error) setSummary(sumRes);
        if (poRes?.data) setPosList(poRes.data.slice(0, 6));
        if (trRes?.data) setTransfers(trRes.data.slice(0, 6));
        const nameToId = {};
        (branchRes?.data || []).forEach((b) => { if (b.id && b.name) nameToId[b.name] = b.id; });
        setBranchMap(nameToId);
        setBranchNames(Object.keys(nameToId));
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

  // Bucket the whole list once; every tab is a slice of these tiers.
  const tiered = stock
    .map((item) => ({ ...item, tier: tierOf(item) }))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.stock / Math.max(a.threshold, 1) - b.stock / Math.max(b.threshold, 1));

  const outItems = tiered.filter((i) => i.tier === 'out');
  const criticalItems = tiered.filter((i) => i.tier === 'critical');
  const lowItems = tiered.filter((i) => i.tier === 'low');
  const attentionItems = [...outItems, ...criticalItems, ...lowItems];

  const tabRows = (() => {
    const byTab = {
      'Needs attention': attentionItems,
      'Out of stock': outItems,
      'Critical': criticalItems,
      'Low stock': lowItems,
      'All stock': tiered
    };
    const rows = byTab[tab] || tiered;
    if (!query) return rows;
    return rows.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  })();

  const lowCount = attentionItems.length;
  // Warn (30s cooldown inside the engine) when stock slips below reorder
  // point while this screen is open — the tab pill goes red in sync.
  const prevLowRef = useRef(lowCount);
  useEffect(() => {
    if (loading) return;
    if (lowCount > 0 && lowCount > prevLowRef.current) play('lowStock');
    prevLowRef.current = lowCount;
  }, [lowCount, loading, play]);
  const stockValue = summary
    ? summary.stock_value
    : stock.reduce((s, i) => s + (i.stock * (i.unitCost || i.estPrice || 0)), 0);
  const wasteWeek = summary ? summary.waste_this_week : 0;

  function openStockCount() {
    toast('Stock count sheet created — pick a location to begin', { tone: 'dark' });
  }

  function openWaste(item) {
    setWasteItem(item);
    setWasteQty('');
    setWasteReason(WASTE_REASONS[0]);
    setWasteOpen(true);
  }

  async function submitWaste() {
    const qty = Number(wasteQty);
    if (!wasteItem || !qty || qty <= 0) return;
    try {
      if (wasteItem.id) {
        await api('/inventory/waste', {
          method: 'POST',
          body: { item_id: wasteItem.id, qty, reason: wasteReason }
        });
      }
      const cost = qty * (wasteItem.unitCost || wasteItem.estPrice || 0);
      setStock((p) => p.map((i) =>
        i.name === wasteItem.name ? { ...i, stock: Math.max(0, i.stock - qty) } : i
      ));
      toast(`Wasted ${qty} ${wasteItem.unit} of ${wasteItem.name} · Rs ${Math.round(cost).toLocaleString()}`, { tone: 'red' });
    } catch {
      toast('Could not record waste — saved locally only', { tone: 'red' });
    }
    setWasteOpen(false);
  }

  async function submitTransfer() {
    const qty = Number(transferQty);
    const fromId = getApiUser()?.branch_id || (Object.keys(branchMap).length === 1 ? branchMap[branchNames[0]] : '');
    const toId = branchMap[transferTo] || '';
    if (!transferItem || !qty || qty <= 0) return;
    if (!fromId || !toId) {
      toast('Choose a destination branch (source is your logged-in branch)', { tone: 'red' });
      return;
    }
    if (fromId === toId) {
      toast('Source and destination must be different branches', { tone: 'red' });
      return;
    }
    try {
      const created = await api('/transfers', {
        method: 'POST',
        body: { item: transferItem, qty, from_branch_id: fromId, to_branch_id: toId }
      });
      setTransfers((p) => [{ id: created?.id || `local-${Date.now()}`, item: transferItem, qty, status: 'Requested', to: transferTo }, ...p].slice(0, 6));
      toast(`Transfer queued: ${qty} × ${transferItem} → ${transferTo}`, { tone: 'green' });
    } catch {
      toast('Could not create transfer — check connection', { tone: 'red' });
    }
    setTransferOpen(false);
  }

  const tierPill = (tier) => {
    if (tier === 'out') return <Pill tone="red" dot>Out of stock</Pill>;
    if (tier === 'critical') return <Pill tone="red" dot>Critical</Pill>;
    if (tier === 'low') return <Pill tone="amber" dot>Low stock</Pill>;
    return <Pill tone="green" dot>In stock</Pill>;
  };

  const currentBranchName = Object.keys(branchMap).find((k) => branchMap[k] === (getApiUser()?.branch_id || '')) || '';

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Inventory" descriptor={loading ? 'Loading…' : `${stock.length} tracked items · ${lowCount} need attention`}>
        <SearchInput
          className="w-[240px]"
          placeholder="Search items"
          value={query}
          onChange={setQuery} />
        <Button variant="outline" onClick={() => setTransferOpen(true)}>
          <ArrowLeftRightIcon className="mr-2 h-4 w-4" /> Transfer
        </Button>
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
              Reorder all ({lowCount})
            </Button>
          }>
          {`${outItems.length} out · ${criticalItems.length} critical · ${lowItems.length} low — worst first: ${attentionItems.slice(0, 3).map((i) => i.name).join(', ')}`}
        </AlertBanner>
      )}

      <StatRow stats={[
        { label: 'Stock value', value: `Rs ${Math.round(stockValue).toLocaleString()}`, meta: 'at last cost' },
        { label: 'Needs attention', value: lowCount, meta: `${outItems.length} out · ${criticalItems.length} critical` },
        { label: 'Waste this week', value: `Rs ${Math.round(wasteWeek).toLocaleString()}`, meta: 'write-offs, 7 days' },
        { label: 'Suppliers', value: new Set(stock.map((i) => i.supplier).filter(Boolean)).size, meta: 'active' }
      ]} />

      <div className="mt-7">
        <Tabs
          options={['Needs attention', 'Out of stock', 'Critical', 'Low stock', 'All stock']}
          value={tab}
          onChange={setTab}
          counts={{
            'Needs attention': lowCount,
            'Out of stock': outItems.length,
            'Critical': criticalItems.length,
            'Low stock': lowItems.length,
            'All stock': stock.length
          }}
          danger={outItems.length > 0 ? 'Out of stock' : (criticalItems.length > 0 ? 'Critical' : undefined)} />
      </div>

      <div className="mt-5">
        <SectionHeader
          index="01"
          title={tab === 'All stock' ? 'Stock on hand' : tab}
          descriptor={tab === 'All stock' ? 'Live count' : 'Worst first — act top down'} />
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
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {tabRows.map((item) => (
                <Tr
                  key={item.name}
                  onClick={() => {
                    setActive(item);
                    setDelta(0);
                  }}
                  className={item.tier === 'out' ? 'bg-tint-red/60' : item.tier === 'critical' ? 'bg-tint-red/30' : item.tier === 'low' ? 'bg-tint-amber/40' : ''}>
                  <Td className="font-semibold">{item.name}</Td>
                  <Td className="text-sm text-meta">{item.category}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="w-20 font-mono text-sm font-bold">
                        {item.stock} {item.unit}
                      </span>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                        <span
                          className={`block h-full rounded-full ${item.tier === 'out' || item.tier === 'critical' ? 'bg-status-red' : item.tier === 'low' ? 'bg-status-amber' : 'bg-status-green'}`}
                          style={{
                            width: `${Math.max(4, Math.min(100, item.stock / Math.max(item.capacity, 1) * 100))}%`
                          }} />
                      </span>
                    </div>
                  </Td>
                  <Td className="font-mono text-sm text-meta">
                    {item.threshold} {item.unit}
                  </Td>
                  <Td>{tierPill(item.tier)}</Td>
                  <Td className="text-sm">{item.supplier}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {item.tier !== 'ok' && (
                        <Button
                          size="sm"
                          variant="dark"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPo(buildPo(item.name, stock, suggestions));
                          }}>
                          Reorder
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openWaste(item);
                        }}>
                        <Trash2Icon className="h-3.5 w-3.5" /> Waste
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          // The row itself opens the adjust drawer; stop the
                          // click here so it doesn't fire twice via bubbling.
                          e.stopPropagation();
                          setActive(item);
                          setDelta(0);
                        }}>
                        Adjust
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {tabRows.length === 0 &&
              <Tr>
                  <Td colSpan={7}>
                    <EmptyState
                      compact
                      tone="green"
                      icon={<CheckCircle2Icon className="h-6 w-6" />}
                      title={query ? 'No items found' : 'Nothing needs attention'}
                      description={query
                        ? `Nothing matches "${query}" in this view.`
                        : 'Every item is above its reorder point. Switch to All stock to browse.'}
                      action={query
                        ? (
                          <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                            Clear search
                          </Button>
                        )
                        : (
                          <Button variant="outline" size="sm" onClick={() => setTab('All stock')}>
                            Browse all stock
                          </Button>
                        )} />
                  </Td>
                </Tr>
              }
            </tbody>
          </Table>
        </TableWrap>
      </div>

      {(transfers.length > 0 || posList.length > 0) &&
      <section className="mt-9">
          <SectionHeader
          index="02"
          title="Inbound & in transit"
          descriptor="Purchase orders and branch transfers" />
          <Shelf>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="mb-3 text-caption font-semibold text-meta">Purchase orders</p>
                {posList.length === 0 && <p className="text-sm text-meta">No open purchase orders.</p>}
                <ul className="space-y-2">
                  {posList.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                      <div>
                        <p className="font-semibold text-ink">{p.supplier}</p>
                        <p className="text-xs text-meta">Rs {Math.round(p.total || 0).toLocaleString()}</p>
                      </div>
                      <Pill tone={p.status === 'received' ? 'green' : p.status === 'cancelled' ? 'red' : 'amber'} dot>
                        {(p.status || 'pending').replace('_', ' ')}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="mb-3 text-caption font-semibold text-meta">Branch transfers</p>
                {transfers.length === 0 && <p className="text-sm text-meta">No transfers in transit.</p>}
                <ul className="space-y-2">
                  {transfers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                      <div>
                        <p className="font-semibold text-ink">{t.item} × {t.qty}</p>
                        <p className="text-xs text-meta">{t.to_branch_id ? `to ${t.to_branch_id}` : ''}</p>
                      </div>
                      <Pill tone={t.status === 'received' ? 'green' : 'amber'} dot>
                        {(t.status || 'in_transit').replace('_', ' ')}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Shelf>
        </section>
      }

      {/* Waste drawer — write-off with reason; stock + value both decrement */}
      <Drawer
        open={wasteOpen}
        onClose={() => setWasteOpen(false)}
        title={wasteItem ? `Record waste — ${wasteItem.name}` : 'Record waste'}
        subtitle={wasteItem ? `${wasteItem.stock} ${wasteItem.unit} on hand · Rs ${wasteItem.unitCost || wasteItem.estPrice || 0}/${wasteItem.unit}` : ''}
        footer={
        <>
            <Button variant="outline" onClick={() => setWasteOpen(false)}>Cancel</Button>
            <Button
              variant="red"
              full
              disabled={!Number(wasteQty) || Number(wasteQty) <= 0}
              onClick={submitWaste}>
              Write off {wasteQty || 0} {wasteItem?.unit || ''}
            </Button>
          </>
        }>
        {wasteItem &&
        <div className="space-y-5">
            <Field label={`Quantity wasted (${wasteItem.unit})`}>
              <input
                type="number"
                min="0"
                step="0.5"
                className={inputClass}
                value={wasteQty}
                onChange={(e) => setWasteQty(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="Reason">
              <select
                className={inputClass}
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value)}>
                {WASTE_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            {Number(wasteQty) > 0 &&
          <div className="flex items-center justify-between rounded-xl border border-status-red/30 bg-tint-red/40 px-4 py-3">
                <span className="text-sm font-semibold text-ink">Value written off</span>
                <span className="font-mono text-sm font-extrabold text-status-red">
                  Rs {Math.round(Number(wasteQty) * (wasteItem.unitCost || wasteItem.estPrice || 0)).toLocaleString()}
                </span>
              </div>
            }
            <p className="text-xs text-meta">
              Waste decrements stock immediately and is logged with the reason for the weekly variance report.
            </p>
          </div>
        }
      </Drawer>

      {/* Transfer drawer — move stock between branches */}
      <Drawer
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer stock"
        subtitle="Move stock between branches"
        footer={
        <>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              variant="dark"
              full
              disabled={!transferItem || !Number(transferQty) || !transferTo}
              onClick={submitTransfer}>
              Queue transfer
            </Button>
          </>
        }>
        <div className="space-y-5">
          <Field label="Item">
            <select
              className={inputClass}
              value={transferItem}
              onChange={(e) => setTransferItem(e.target.value)}>
              <option value="">Select item…</option>
              {stock.map((i) => <option key={i.name} value={i.name}>{i.name} ({i.stock} {i.unit})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="Destination">
              <select
                className={inputClass}
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                disabled={branchNames.length < 2}>
                <option value="">{branchNames.length < 2 ? 'Need a second branch to transfer stock' : 'Select branch…'}</option>
                {branchNames.filter((b) => b !== currentBranchName).map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-xs text-meta">
            The receiving branch confirms arrival; stock only leaves your count when they receive it.
          </p>
        </div>
      </Drawer>

      {/* Adjust drawer — same as before, now reachable from every tab */}
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
                  api(`/inventory/${active.id}/adjust`, { method: 'PUT', body: { delta } })
                    .catch(async () => {
                      try {
                        const res = await api('/inventory');
                        if (res?.data?.length) setStock(res.data.map((i) => toDisplayItem(i, staticById)));
                      } catch { /* keep last-known stock */ }
                      toast(`Adjust failed — stock left unchanged`, { tone: 'red' });
                    });
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
              <p className="text-caption font-semibold text-meta">
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

            <p className="text-xs text-meta">
              Every adjustment is written to the audit trail with your name and role.
            </p>
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

      {lowCount > 0 &&
      <button
        type="button"
        onClick={() => setTab('Needs attention')}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-status-red px-4 py-3 text-sm font-bold text-white shadow-pop lg:hidden">
          <TriangleAlertIcon className="h-4 w-4" />
          {lowCount} need attention
        </button>
      }
    </div>);
}
