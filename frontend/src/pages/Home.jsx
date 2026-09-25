import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  CalendarPlusIcon,
  ChefHatIcon,
  ClipboardListIcon,
  DeleteIcon,
  Grid2x2Icon,
  PlusIcon,
  ReceiptIcon,
  SparklesIcon,
  StarIcon,
  StoreIcon,
  TrendingUpIcon,
  UtensilsIcon,
  WalletIcon
} from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { TrendChart } from '../components/ui/TrendChart';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass, FilterChips } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { Pill } from '../components/ui/Pill';
import { useRole, canAccess } from '../state/RoleContext';
import { useSettings } from '../state/SettingsContext';
import { useTables } from '../state/TableContext';
import { useOrders } from '../state/OrderContext';
import { api } from '../api/client';
import { useBackoffInterval } from '../api/poll';
import { elapsedFrom, isOverSLA, normalizeTicket, shortId, SLA_MINUTES, useElapsedClock } from '../api/normalize';
import { stations } from '../data/pos';

const registerKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
const registerOptions = ['Register 1', 'Register 2', 'Register 3'];

const STATUS_TONE = {
  incoming: 'amber',
  preparing: 'blue',
  ready: 'green'
};

const fmtRs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const parseAmt = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, '')) || 0);
const compactAmt = (n) => {
  const v = Number(n) || 0;
  return v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v);
};

const trackTitle = (t) => {
  const table = String(t?.table || '').trim();
  if (table && table !== '—') return `Table ${table}`;
  const type = String(t?.type || 'dine-in').toLowerCase();
  if (type === 'takeaway') return 'Takeaway';
  if (type === 'delivery') return 'Delivery';
  return shortId(t?.id);
};

function Kpi({ label, value, meta, note, hero = false }) {
  if (hero) {
    return (
      <div className="rounded-card p-6 lg:p-7 border border-ink bg-ink text-white">
        <p className="text-caption font-semibold text-white/60">{label}</p>
        <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-white lg:text-[2rem]">{value}</p>
        {meta && <p className="mt-1 text-xs text-white/60">{meta}</p>}
        {note && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">{note}</p>}
      </div>
    );
  }
  return (
    <Card>
      <p className="text-caption font-semibold text-meta">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      {meta && <p className="mt-1 text-xs text-meta">{meta}</p>}
      {note && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-accent">{note}</p>}
    </Card>
  );
}

function PanelTitle({ index, title, descriptor, right }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="font-mono text-sm text-meta">{index}</span>
        <h2 className="truncate text-base font-bold tracking-tight text-ink">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {descriptor && <span className="hidden text-caption font-medium text-meta sm:inline">{descriptor}</span>}
        {right}
      </div>
    </div>
  );
}

export function Home() {
  const toast = useToast();
  const navigate = useNavigate();
  const { role } = useRole();
  const { settings } = useSettings();
  const { tables, occupiedCount } = useTables();
  const { incoming: liveIncoming } = useOrders();
  const now = useElapsedClock(30000);

  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [attention, setAttention] = useState(null);
  const [payRows, setPayRows] = useState(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerInfo, setRegisterInfo] = useState(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [floatValue, setFloatValue] = useState('5000');
  const [selectedRegister, setSelectedRegister] = useState('Register 1');
  const [cashierName, setCashierName] = useState('');
  const [countedCash, setCountedCash] = useState('');

  const can = (path) => canAccess(role, path);
  const canRegister = can('/register');

  useEffect(() => {
    let off = false;
    // Revenue figures are behind RequireRole("Store Manager") — a cashier or
    // kitchen hat should not 403 on every visit.
    if (!can('/reports')) return undefined;
    api('/reports/summary')
      .then((res) => { if (!off && res) setSummary(res); })
      .catch(() => {});
    return () => { off = true; };
  }, [canRegister, role]);

  const loadTickets = useCallback(async () => {
    try {
      const res = await api('/kds/tickets');
      setTickets((res?.data || [])?.map(normalizeTicket));
    } catch (e) {
      setTickets([]);
      throw e; // let the poller back off while the API is down
    }
  }, []);
  useBackoffInterval(loadTickets, 30000);

  // Attention cards are each behind their own manager/auditor gate; poll only
  // the ones this role can actually read so restricted staff don't fire a wall
  // of 403s every minute. When nothing is readable the counters read 0.
  const loadAttention = useCallback(async () => {
    const calls = [];
    if (canAccess(role, '/inventory')) calls.push(api('/inventory/reorder-suggestions'));
    if (canAccess(role, '/invoices')) calls.push(api('/invoices'));
    if (canAccess(role, '/feedback')) calls.push(api('/feedback'));
    if (canAccess(role, '/refunds')) calls.push(api('/refunds'));
    if (calls.length === 0) {
      setAttention({ inventory: 0, invoices: 0, feedback: 0, refunds: 0 });
      return;
    }
    const settled = await Promise.allSettled(calls);
    const [inv, invs, fb, rf] = [settled[0], settled[1], settled[2], settled[3]];
    const setOr = (r, pick) => (r?.status === 'fulfilled' ? pick(r.value) : 0);
    setAttention({
      inventory: setOr(inv, (v) => (v?.data || []).length),
      invoices: setOr(invs, (v) =>
        (v?.data || []).filter((i) => String(i.status || '').toLowerCase() === 'overdue').length),
      feedback: setOr(fb, (v) =>
        (v?.data || []).filter((f) => String(f.status || '').toLowerCase() !== 'resolved').length),
      refunds: setOr(rf, (v) =>
        (v?.data || []).filter((r) => !/approved|resolved|done/i.test(String(r.status || ''))).length)
    });
  }, [role]);
  const pollAttention = useCallback(async () => {
    try {
      await loadAttention();
    } catch (e) {
      setAttention({ inventory: 0, invoices: 0, feedback: 0, refunds: 0 });
      throw e; // back off while the API is down
    }
  }, [loadAttention]);
  useBackoffInterval(pollAttention, 60000);

  useEffect(() => {
    let off = false;
    api('/transactions')
      .then((res) => { if (!off) setPayRows(res?.data || []); })
      .catch(() => { if (!off) setPayRows([]); });
    return () => { off = true; };
  }, []);

  const openTickets = useMemo(() => {
    const map = new Map();
    const push = (t, status, source) => {
      const id = String(t.id);
      if (map.has(id)) return;
      map.set(id, {
        ...t,
        status: status || t.status || 'incoming',
        elapsed: elapsedFrom(t.created_at, now),
        source
      });
    };
    (liveIncoming || []).forEach((t) => push(t, 'incoming', 'live'));
    (tickets || [])
      .filter((t) => ['incoming', 'preparing', 'ready'].includes(t.status))
      .forEach((t) => push(t, t.status, 'api'));
    return [...map.values()]
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .slice(0, 5);
  }, [liveIncoming, tickets, now]);

  const kitchen = useMemo(() => {
    const build = stations.map((s) => {
      const list = [...(tickets || []), ...(liveIncoming || [])]
        .filter((t) => (t.station || 'Kitchen') === s && ['incoming', 'preparing', 'ready'].includes(t.status || 'incoming'));
      return {
        station: s,
        total: list.length,
        incoming: list.filter((t) => (t.status || 'incoming') === 'incoming').length,
        preparing: list.filter((t) => (t.status || 'incoming') === 'preparing').length,
        ready: list.filter((t) => (t.status || 'incoming') === 'ready').length,
        late: list.filter((t) => isOverSLA(elapsedFrom(t.created_at, now))).length
      };
    });
    return build;
  }, [tickets, liveIncoming, now]);

  const occupancyPct = tables.length ? Math.round((occupiedCount / tables.length) * 100) : 0;
  const seated = tables.filter((t) => t.state === 'Seated' || t.state === 'Check dropped').length;
  const needsTable = tables.filter((t) => t.state === 'Needs attention').length;

  // Revenue comes back newest-first; flip to oldest-first so "this period vs
  // the one before" compares the two most recent days, not the two oldest.
  const revenueSeries = (summary?.revenue?.length
    ? [...summary.revenue].reverse().slice(-7)
    : []);
  const totalRevenue = summary?.total_revenue > 0 ? summary.total_revenue : 0;
  const [r0, r1] = revenueSeries.length >= 2
    ? [revenueSeries[revenueSeries.length - 2].amount, revenueSeries[revenueSeries.length - 1].amount]
    : [0, 0];
  const deltaPct = r0 > 0 ? (((r1 - r0) / r0) * 100).toFixed(1) : null;
  const maxRevenue = Math.max(...revenueSeries.map((p) => p.amount));

  const topProducts = (summary?.top_sellers || []).slice(0, 5);
  const maxTop = Math.max(1, ...topProducts.map((p) => Number(p.count) || 0));
  const topTotal = topProducts.reduce((s, p) => s + (Number(p.count) || 0), 0);

  const payBreakdown = useMemo(() => {
    const rows = payRows || [];
    const groups = new Map();
    rows.forEach((r) => {
      const method = String(r.method || 'Other');
      const amount = parseAmt(r.amount);
      const status = String(r.status || '');
      if (/refunded/i.test(status)) return;
      groups.set(method, (groups.get(method) || 0) + amount);
    });
    const order = ['Cash', 'Card', 'QR/Wallet', 'Online'];
    const entries = [...groups.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return { entries, total };
  }, [payRows]);
  const payTotal = payBreakdown.total > 0 ? payBreakdown.total : totalRevenue;

  const lateKitchen = kitchen.reduce((s, k) => s + k.late, 0);

  const grossSales = totalRevenue ? totalRevenue.toLocaleString('en-IN') : '0';
  const floatDisplay = Number(floatValue || 0).toLocaleString('en-IN');
  // TODO(real-close): refunds and expected cash must come from the payments /
  // cash-drawer APIs before Close-of-day can be trusted with real money.
  const totalRefunds = '0';
  const expectedCash = floatDisplay;
  const countedDisplay = Number(countedCash || 0).toLocaleString('en-IN');
  const discrepancy = countedCash && countedCash !== '0' ? Number(countedCash) - Number(expectedCash.replace(/,/g, '')) : 0;
  const hasDiscrepancy = countedCash && countedCash !== '0' && discrepancy !== 0;

  const quickActions = [
    canRegister && { label: 'New Order', path: '/register', icon: <PlusIcon className="h-4 w-4" />, variant: 'dark' },
    can('/bookings') && { label: 'New Booking', path: '/bookings', icon: <CalendarPlusIcon className="h-4 w-4" />, variant: 'outline' },
    can('/front-of-house') && { label: 'View Tables', path: '/front-of-house', icon: <Grid2x2Icon className="h-4 w-4" />, variant: 'outline' },
    can('/kds') && { label: 'View Kitchen', path: '/kds', icon: <ChefHatIcon className="h-4 w-4" />, variant: 'outline' }
  ].filter(Boolean);

  const attentionItems = [];
  if (attention?.inventory) attentionItems.push({ label: `${attention.inventory} inventory items below threshold`, path: '/inventory', tone: 'red', icon: 'inventory' });
  if (attention?.invoices) attentionItems.push({ label: `${attention.invoices} overdue invoice${attention.invoices > 1 ? 's' : ''}`, path: '/invoices', tone: 'red', icon: 'invoice' });
  if (attention?.refunds) attentionItems.push({ label: `${attention.refunds} refund request${attention.refunds > 1 ? 's' : ''} awaiting approval`, path: '/refunds', tone: 'amber', icon: 'refund' });
  if (attention?.feedback) attentionItems.push({ label: `${attention.feedback} flagged QR feedback`, path: '/feedback', tone: 'amber', icon: 'feedback' });
  if (lateKitchen) attentionItems.push({ label: `${lateKitchen} kitchen ticket${lateKitchen > 1 ? 's' : ''} over ${SLA_MINUTES} min`, path: '/kds', tone: 'red', icon: 'kitchen' });
  if (needsTable) attentionItems.push({ label: `${needsTable} table${needsTable > 1 ? 's' : ''} need attention`, path: '/front-of-house', tone: 'amber', icon: 'table' });

  const attentionIcon = (icon) => {
    switch (icon) {
      case 'inventory': return <StoreIcon className="h-4 w-4" />;
      case 'invoice': return <ReceiptIcon className="h-4 w-4" />;
      case 'refund': return <WalletIcon className="h-4 w-4" />;
      case 'feedback': return <StarIcon className="h-4 w-4" />;
      case 'kitchen': return <ClipboardListIcon className="h-4 w-4" />;
      case 'table': return <UtensilsIcon className="h-4 w-4" />;
      default: return <AlertTriangleIcon className="h-4 w-4" />;
    }
  };

  const confirmRegister = () => {
    if (floatValue === '0') return;
    setRegisterInfo({ float: floatDisplay, register: selectedRegister, cashier: cashierName });
    setRegisterOpen(false);
    toast.success(`Register open · Rs ${floatDisplay}`);
  };

  const confirmClose = () => {
    setRegisterInfo(null);
    setCloseOpen(false);
    setCountedCash('');
    toast.success('Register closed · End of day');
  };

  const printZ = () => {
    toast.success('Z-report prepared');
  };

  const press = (setter) => (k) => {
    if (k === '⌫') setter((a) => (a.length > 1 ? a.slice(0, -1) : '0'));
    else setter((a) => (a === '0' ? k : a + k));
  };

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={`${settings.businessName}`} descriptor={`${today} · ${settings.name}`}>
        {registerInfo
          ? <Button variant="outline" onClick={() => setCloseOpen(true)}>Close of day</Button>
          : canRegister && <Button variant="dark" onClick={() => { setRegisterOpen(true); setFloatValue('5000'); setSelectedRegister('Register 1'); setCashierName(''); }}>Open register</Button>}
      </PageHeader>

      {registerInfo && (
        <div className="mb-5 flex items-center gap-3">
          <Pill tone="green" dot>Register open</Pill>
          <span className="text-sm text-meta">Rs {registerInfo.float} · {registerInfo.register} · {registerInfo.cashier}</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {quickActions.map((a) => (
          <Button key={a.label} size="sm" variant={a.variant} icon={a.icon} onClick={() => navigate(a.path)}>
            {a.label}
          </Button>
        ))}
        {lateKitchen > 0 && (
          <Button size="sm" variant="red" icon={<AlertTriangleIcon className="h-4 w-4" />} className="ml-auto" onClick={() => navigate('/kds')}>
            {lateKitchen} ticket{lateKitchen > 1 ? 's' : ''} late
          </Button>
        )}
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          hero
          label="Today's sales"
          value={fmtRs(totalRevenue)}
          meta={`${deltaPct !== null ? `${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs previous period` : 'vs previous period'} · ${summary?.avg_order_value ? `avg ${fmtRs(summary.avg_order_value)} / order` : ''}`}
          note="last 24 hours" />
        <Kpi
          label="Orders"
          value={summary?.total_orders || 0}
          meta={`${openTickets.length} open ticket${openTickets.length === 1 ? '' : 's'} now`} />
        <Kpi
          label="Table occupancy"
          value={`${occupancyPct}%`}
          meta={`${occupiedCount} of ${tables.length} tables seated · ${seated} with checks`} />
        <Kpi
          label="Open tickets"
          value={openTickets.length}
          meta={`${kitchen.reduce((s, k) => s + k.incoming + k.preparing, 0)} live in kitchen · ${lateKitchen} late`} />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <PanelTitle index="01" title="Open orders" descriptor="Oldest first" right={
              <Link to="/orders" className="text-13 font-semibold text-status-blue hover:text-ink transition-colors">View all</Link>
            } />
            {openTickets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-meta">
                <ClipboardListIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm">No open orders right now</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {openTickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <Pill tone={STATUS_TONE[t.status] || 'neutral'} dot>
                      {t.status}
                    </Pill>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {trackTitle(t)}
                        <span className="ml-2 font-normal text-meta">{shortId(t.id)}</span>
                      </p>
                      <p className="truncate text-xs text-meta">
                        {(t.items || []).slice(0, 2).map((l) => (typeof l === 'string' ? l : `${l.qty}× ${l.name}`)).join(' · ')}
                        {(t.items || []).length > 2 ? ` · +${t.items.length - 2} more` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 font-mono text-13 ${isOverSLA(t.elapsed) ? 'font-bold text-status-red' : 'text-meta'}`}>
                      {t.elapsed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <PanelTitle index="02" title="Kitchen activity" descriptor="Live per station" right={
              <Link to="/kds" className="inline-flex items-center gap-1.5 text-13 font-semibold text-status-blue hover:text-ink transition-colors">
                <ChefHatIcon className="h-4 w-4" /> Open kitchen display
              </Link>
            } />
            <div className="grid gap-2 sm:grid-cols-2">
              {kitchen.map((k) => (
                <div key={k.station} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <ChefHatIcon className="h-4 w-4 text-meta" />
                    <span className="text-sm font-bold text-ink">{k.station}</span>
                    {k.late > 0 && (
                      <span className="rounded-full bg-status-red/10 px-2 py-0.5 text-caption font-semibold text-status-red">
                        {k.late} late
                      </span>
                    )}
                  </div>
                  {k.total === 0 ? (
                    <span className="text-13 text-meta">Idle</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {k.incoming > 0 && <span className="rounded-full bg-tint-amber px-2 py-0.5 text-micro font-bold text-status-amber">{k.incoming} new</span>}
                      {k.preparing > 0 && <span className="rounded-full bg-tint-blue px-2 py-0.5 text-micro font-bold text-status-blue">{k.preparing} cooking</span>}
                      {k.ready > 0 && <span className="rounded-full bg-tint-green px-2 py-0.5 text-micro font-bold text-status-green">{k.ready} ready</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full">
            <PanelTitle index="03" title="Needs attention" descriptor={attentionItems.length ? `${attentionItems.length} item${attentionItems.length > 1 ? 's' : ''}` : 'All clear'} />
            {attentionItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-meta">
                <SparklesIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm">Everything looks good</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {attentionItems.map((a) => (
                  <li key={a.path + a.label}>
                    <Link
                      to={a.path}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150 ease-soft hover:bg-canvas ${
                        a.tone === 'red' ? 'border-status-red/30 bg-tint-red' : 'border-status-amber/30 bg-tint-amber'
                      }`}>
                      <span className={`shrink-0 ${a.tone === 'red' ? 'text-status-red' : 'text-status-amber'}`}>
                        {attentionIcon(a.icon)}
                      </span>
                      <span className="min-w-0 flex-1 text-13 font-semibold text-ink">{a.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <PanelTitle index="04" title="Sales trend" descriptor="Last 7 periods" right={
            can('/reports') && <Link to="/reports" className="text-13 font-semibold text-status-blue hover:text-ink transition-colors">Reports</Link>
          } />
          {maxRevenue > 0 ? (
            <TrendChart
              data={revenueSeries}
              xKey="date"
              valueKey="amount"
              color="#1C1B19"
              tint="#EEEBE4"
              seriesLabel="Sales"
              labelEvery={1}
              height={236}
              formatY={(v) => `Rs ${compactAmt(v)}`}
              formatValue={(v) => fmtRs(v)}
              formatTitle={(row) => String(row?.date ?? '')} />
          ) : (
            <div className="flex h-44 flex-col items-center justify-center gap-2 text-meta">
              <TrendingUpIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">No sales recorded for this period yet</p>
            </div>
          )}
        </Card>

        <Card>
          <PanelTitle index="05" title="Top products" descriptor="Today" right={
            can('/reports') && <Link to="/reports" className="text-13 font-semibold text-status-blue hover:text-ink transition-colors">Details</Link>
          } />
          {topProducts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-meta">
              <TrendingUpIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">No sales recorded yet today</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => {
                const isTop = i === 0;
                return (
                  <li key={p.name}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold ${isTop ? 'bg-ink text-white' : 'bg-canvas text-meta'}`}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                      </span>
                      <span className="shrink-0">
                        <span className="font-mono text-sm font-bold text-ink">{Number(p.count) || 0}</span>
                        <span className="ml-1 text-[10px] font-bold text-meta">sold</span>
                      </span>
                    </div>
                    <div className="ml-[30px] flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                        <div className={`h-full rounded-full ${isTop ? 'bg-ink' : 'bg-ink/25'}`} style={{ width: `${((Number(p.count) || 0) / maxTop) * 100}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-meta">
                        {topTotal ? Math.round(((Number(p.count) || 0) / topTotal) * 100) : 0}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {topProducts.length > 0 && topTotal > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-13 text-meta">
              <span className="font-bold text-ink">{topTotal}</span> units sold today across the top {topProducts.length} items
            </p>
          )}
        </Card>
      </div>

      <Card className="mb-8">
        <PanelTitle index="06" title="Payment summary" descriptor="Today by method" right={
          <Link to="/transactions" className="text-13 font-semibold text-status-blue hover:text-ink transition-colors">All transactions</Link>
        } />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {payBreakdown.entries.map(([method, amount]) => (
            <div key={method} className="rounded-xl border border-line bg-canvas px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold text-meta">{method}</span>
                <WalletIcon className="h-3.5 w-3.5 text-meta" />
              </div>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{fmtRs(amount)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-ink" style={{ width: `${payTotal ? (amount / payTotal) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
          {payBreakdown.entries.length === 0 && (
            <p className="text-sm text-meta">No payments recorded today yet.</p>
          )}
        </div>
        {payTotal > 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-meta">
            <TrendingUpIcon className="h-4 w-4" />
            <span className="font-semibold text-ink">{fmtRs(payTotal)}</span> collected across {payBreakdown.entries.length} method{payBreakdown.entries.length === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      <Drawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="Open register"
        subtitle="Start a new shift"
        footer={<Button variant="dark" full onClick={confirmRegister}>Confirm open</Button>}>
        <div className="space-y-5">
          <Field label="Opening float">
            <div className="flex items-center rounded-xl border border-line bg-surface px-3">
              <span className="font-mono text-sm text-meta">Rs</span>
              <span className="ml-2 flex-1 font-mono text-2xl font-extrabold text-ink">{floatDisplay}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {registerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(setFloatValue)(k)}
                  className="flex h-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface active:bg-line">
                  {k === '⌫' ? <DeleteIcon className="h-4 w-4" /> : k}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Terminal">
            <FilterChips options={registerOptions} value={selectedRegister} onChange={setSelectedRegister} />
          </Field>
          <Field label="Cashier name">
            <input type="text" value={cashierName} onChange={(e) => setCashierName(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close of day"
        subtitle={registerInfo ? `Rs ${registerInfo.float} · ${registerInfo.register}` : undefined}
        footer={<Button variant="dark" full onClick={confirmClose}>Confirm close</Button>}>
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-meta">Gross sales</span>
              <span className="font-mono font-bold text-ink">Rs {grossSales}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-meta">Refunds</span>
              <span className="font-mono font-bold text-status-red">−Rs {totalRefunds}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-sm">
              <span className="font-bold text-ink">Expected cash</span>
              <span className="font-mono font-extrabold text-ink">Rs {expectedCash}</span>
            </div>
          </div>

          <Field label="Counted cash">
            <div className="flex items-center rounded-xl border border-line bg-surface px-3">
              <span className="font-mono text-sm text-meta">Rs</span>
              <span className="ml-2 flex-1 font-mono text-2xl font-extrabold text-ink">{countedDisplay || '0'}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {registerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(setCountedCash)(k)}
                  className="flex h-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface active:bg-line">
                  {k === '⌫' ? <DeleteIcon className="h-4 w-4" /> : k}
                </button>
              ))}
            </div>
          </Field>

          {hasDiscrepancy && (
            <div className="rounded-xl border border-status-red bg-tint-red p-3 text-sm font-semibold text-status-red">
              Discrepancy: {discrepancy > 0 ? '+' : ''}Rs {discrepancy.toLocaleString('en-IN')}
            </div>
          )}

          <div>
            <p className="mb-2 text-caption font-semibold text-meta">Open orders (blocking close)</p>
            <div className="space-y-2">
              {openTickets.length === 0 && <p className="text-sm text-meta">No open orders.</p>}
              {openTickets.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <div>
                    <span className="text-sm font-bold text-ink">{shortId(o.id)}</span>
                    <span className="ml-2 text-xs text-meta">{trackTitle(o)}</span>
                  </div>
                  <span className="text-xs text-meta">{o.elapsed}</span>
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" full onClick={printZ}>Print Z-report</Button>
        </div>
      </Drawer>
    </div>);
}