import { useEffect, useMemo, useState } from 'react';
import {
  CalendarIcon,
  ChevronDownIcon,
  DownloadIcon,
  ReceiptIcon,
  TicketPercentIcon,
  TrendingDownIcon,
  TrophyIcon,
  Undo2Icon,
  WalletIcon } from
'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { TrendChart } from '../components/ui/TrendChart';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';

const RANGE_OPTIONS = ['Today', '7 days', '28 days', 'All time'];
const RANGE_DAYS = { 'Today': 1, '7 days': 7, '28 days': 28, 'All time': 0 };

const rs = (n) => `Rs ${Math.round(n || 0).toLocaleString('en-IN')}`;

const hourLabel = (h) => `${String(h % 24).padStart(2, '0')}:00`;

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// One horizontal stacked bar for payment methods.
const MIX_COLORS = ['bg-ink', 'bg-status-blue', 'bg-status-amber', 'bg-status-purple', 'bg-status-green', 'bg-status-red'];

function PaymentMixCard({ mix, totalSales }) {
  const rows = mix && mix.length > 0 ? mix : [];
  const total = rows.reduce((s, m) => s + m.amount, 0) || totalSales;
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-blue text-status-blue">
            <WalletIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Payment mix</h3>
            <p className="text-caption font-medium text-meta">Where the money came in</p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
        compact
        title="No payments in this period"
        description="Settled transactions will appear here by method." />
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
            {rows.map((m, i) => (
              <span
              key={m.method}
              className={MIX_COLORS[i % MIX_COLORS.length]}
              style={{ width: `${Math.max(2, pct(m.amount, total))}%` }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {rows.map((m, i) => (
              <li key={m.method} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${MIX_COLORS[i % MIX_COLORS.length]}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.method}</span>
                <span className="shrink-0 font-mono text-xs text-meta">{m.count} txns</span>
                <span className="w-24 shrink-0 text-right font-mono text-sm font-extrabold text-ink">{rs(m.amount)}</span>
                <span className="w-10 shrink-0 text-right font-mono text-caption font-semibold text-meta">{pct(m.amount, total)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// Sales-by-hour area chart — same TrendChart family as "Sales over time":
// smooth line, soft gradient fill, hover guide + tooltip, 00:00-23:00 axis.
// A Days dropdown (Today / Yesterday / 7 / 30) re-queries the overview and
// recomputes the busiest-hour insight, exactly like the page header control.
const PEAK_RANGES = [
  { key: 'Today', days: 1, offset: 0 },
  { key: 'Yesterday', days: 1, offset: 24 },
  { key: 'Last 7 days', days: 7, offset: 0 },
  { key: 'Last 30 days', days: 30, offset: 0 },
];

function PeakHoursCard({ hours, peakRange, onPeakRangeChange, loading = false }) {
  const rows = useMemo(() => (hours && hours.length > 0 ? hours : []), [hours]);

  const axis = useMemo(() => {
    const byHour = Object.fromEntries(rows.map((h) => [h.hour, h]));
    return Array.from({ length: 24 }, (_, h) => ({
      label: hourLabel(h),
      hour: h,
      amount: Number(byHour[h]?.amount) || 0,
      orders: Number(byHour[h]?.orders) || 0
    }));
  }, [rows]);

  const data = useMemo(
    () => axis.map(({ label, amount }) => ({ label, amount })),
    [axis]
  );

  const peak = rows.reduce((best, h) => (h.amount > (best?.amount ?? -1) ? h : best), null);
  const total = axis.reduce((s, h) => s + h.amount, 0);

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-amber text-status-amber">
            <CalendarIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Peak hours</h3>
            <p className="text-caption font-medium text-meta">Sales by hour of day</p>
          </div>
        </div>
        <DaysDropdown
          value={peakRange.key}
          options={PEAK_RANGES.map((r) => r.key)}
          onSelect={(key) => onPeakRangeChange(PEAK_RANGES.find((r) => r.key === key))}
          disabled={loading}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          title={loading ? 'Loading hourly data' : 'No hourly data in this range'}
          description={loading ? 'Fetching sales by hour…' : 'Pick a wider day range or settle a payment first.'}
        />
      ) : (
        <>
          <TrendChart
            data={data}
            valueKey="amount"
            color="#D97706"
            tint="#FEF3C7"
            labelEvery={3}
            height={200}
            formatY={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
            formatValue={rs}
            formatTitle={(row) => row.label}
            seriesLabel="Sales this hour"
          />
          <div className="mt-1.5 flex justify-between font-mono text-micro text-meta">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
          {peak && (
            <p className="mt-3 rounded-xl border border-status-amber/25 bg-tint-amber/40 px-4 py-2.5 text-xs font-semibold text-status-amber">
              Busiest {hourLabel(peak.hour)}–{hourLabel((peak.hour + 1) % 24)} does {pct(peak.amount, total)}% of sales in {peakRange.key.toLowerCase()} — staff accordingly.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// Small dropdown — visually identical to the page header's range control.
function DaysDropdown({ value, options, onSelect, disabled = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}>
        {value}
        <ChevronDownIcon className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {options.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { onSelect(k); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors duration-150 ease-soft ${
                k === value ? 'bg-ink text-white' : 'text-ink hover:bg-canvas'}`}>
              {k}
              {k === value && <Pill tone="blue">Current</Pill>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Ranked bar list with avg ticket per table.
function TableUsageCard({ usage }) {
  const rows = (usage || []).filter((t) => t.table !== 'Other');
  const maxRevenue = Math.max(...rows.map((t) => t.revenue), 1);
  const best = rows[0];

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-green text-status-green">
            <ReceiptIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Table utilization</h3>
            <p className="text-caption font-medium text-meta">Revenue & tickets per table</p>
          </div>
        </div>
        {best &&
        <Pill tone="green" dot>{best.table} leads</Pill>
        }
      </div>

      {rows.length === 0 ? (
        <EmptyState
        compact
        title="No table data"
        description="Transactions tagged to a table will rank here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.table}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-ink">{t.table}</p>
                <p className="font-mono text-sm font-extrabold text-ink">{rs(t.revenue)}</p>
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
                  <span className="block h-full rounded-full bg-status-green" style={{ width: `${Math.max(4, (t.revenue / maxRevenue) * 100)}%` }} />
                </span>
                <span className="shrink-0 font-mono text-caption font-semibold text-meta">
                  {t.orders} txn · avg {rs(t.avg_ticket)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Taxes, discounts, refunds in one glance.
function MoneyOutCard({ taxCollected, discounts, refundsTotal, refundsCount, netSales }) {
  const rows = [
    { label: 'Tax collected', value: taxCollected, note: 'VAT on settled sales', icon: <ReceiptIcon className="h-4 w-4" /> },
    { label: 'Discounts given', value: discounts, note: 'promotions & comps', icon: <TicketPercentIcon className="h-4 w-4" /> },
    { label: 'Refunds', value: refundsTotal, note: `${refundsCount} refund${refundsCount === 1 ? '' : 's'} issued`, icon: <Undo2Icon className="h-4 w-4" /> }
  ];
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-red text-status-red">
            <Undo2Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Where money went out</h3>
            <p className="text-caption font-medium text-meta">Against {rs(netSales)} net sales</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-meta">
              {r.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{r.label}</p>
              <p className="text-caption text-meta">{r.note}</p>
            </div>
            <span className="shrink-0 font-mono text-sm font-extrabold text-ink">{rs(r.value)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm font-semibold text-meta">Gross sales − refunds</span>
        <span className="font-mono text-sm font-extrabold text-ink">{rs(netSales)}</span>
      </div>
    </Card>
  );
}

// Shared product ranking row (top sellers / slow movers).
const RANK_TONES = ['bg-ink text-white', 'bg-tint-blue text-status-blue', 'bg-tint-amber text-status-amber'];
const rankBadgeClass = (i) => RANK_TONES[i] || 'bg-canvas text-meta ring-1 ring-line';

function ProductRow({ item, rank, maxSold, totalUnits, barTone }) {
  const sharePct = totalUnits ? Math.round((item.sold / totalUnits) * 100) : 0;
  const widthPct = maxSold ? Math.max(6, (item.sold / maxSold) * 100) : 0;
  return (
    <li className="rounded-xl border border-transparent p-2 transition-colors duration-150 ease-soft hover:border-line hover:bg-canvas">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold ${rankBadgeClass(rank)}`}>
          {rank + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-bold text-ink">{item.name}</p>
            <p className="shrink-0 font-mono text-sm font-extrabold text-ink">{item.revenue}</p>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
              <span className={`block h-full rounded-full ${barTone}`} style={{ width: `${widthPct}%` }} />
            </span>
            <span className="shrink-0 font-mono text-caption font-semibold text-meta">
              {item.sold} sold · {sharePct}%
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function TopSellersCard({ rows }) {
  const maxSold = Math.max(...rows.map((r) => r.sold), 1);
  const totalUnits = rows.reduce((s, r) => s + r.sold, 0);
  const leader = rows[0];
  const runnerUp = rows[1];
  const leadPct = leader && runnerUp?.sold ? Math.round(((leader.sold - runnerUp.sold) / runnerUp.sold) * 100) : 0;

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-amber text-status-amber">
            <TrophyIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Top products</h3>
            <p className="text-caption font-medium text-meta">Best 8 · by units sold</p>
          </div>
        </div>
      </div>

      {leadPct > 0 && (
        <p className="mb-3 rounded-xl border border-status-amber/25 bg-tint-amber/40 px-4 py-2.5 text-xs font-semibold text-status-amber">
          <TrophyIcon className="mr-1.5 inline h-3.5 w-3.5" />
          {leader.name} outsells #2 by {leadPct}% — your strongest item.
        </p>
      )}

      <ul className="-mx-2 space-y-1">
        {rows.map((r, i) =>
          <ProductRow key={r.name} item={r} rank={i} maxSold={maxSold} totalUnits={totalUnits} barTone={i === 0 ? 'bg-status-amber' : 'bg-ink/75'} />
        )}
      </ul>
    </Card>
  );
}

function SlowMoversCard({ rows }) {
  const maxSold = Math.max(...rows.map((r) => r.sold), 1);
  const totalUnits = rows.reduce((s, r) => s + r.sold, 0);
  const cutCount = rows.filter((r) => r.sold <= 6).length;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint-red text-status-red">
            <TrendingDownIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-ink">Slowest movers</h3>
            <p className="text-caption font-medium text-meta">Review or cut</p>
          </div>
        </div>
        {cutCount > 0 && <Pill tone="red">{cutCount} cut candidates</Pill>}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          title="Nothing sold slowly here"
          description="No items struggled in the selected period — line items from new orders fill this list." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {rows.map((r, i) => (
            <ProductRow
              key={r.name}
              item={r}
              rank={i}
              maxSold={maxSold}
              totalUnits={totalUnits}
              barTone={r.sold <= 6 ? 'bg-status-red' : 'bg-meta/60'} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Reports() {
  const toast = useToast();
  const [range, setRange] = useState('7 days');
  // Human-readable window shown under each KPI so the numbers are never
  // mistaken for another period (Dashboard shows today; Reports defaults to 7).
  const periodLabel = { 'Today': 'today only', '7 days': 'last 7 days', '28 days': 'last 28 days', 'All time': 'all time' }[range] || 'selected period';
  // Live dashboard: the 30s tick re-runs the fetch effect so new sales,
  // top sellers and slow-movers appear without a manual refresh (same cadence
  // as the kitchen and front-of-house lanes).
  const [rangeOpen, setRangeOpen] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const [overview, setOverview] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState(null);

  const [topSellerRows, setTopSellerRows] = useState([]);
  const [slowMoverRows, setSlowMoverRows] = useState([]);

  // Peak hours keeps its own day-range so changing it re-queries only that
  // card's data instead of retuning every KPI on the page.
  const [peakRange, setPeakRange] = useState(PEAK_RANGES[0]);
  const [peakHours, setPeakHours] = useState([]);
  const [peakLoading, setPeakLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPeakLoading(true);
    (async () => {
      try {
        const res = await api(`/reports/overview?days=${peakRange.days}${peakRange.offset ? `&offsetHours=${peakRange.offset}` : ''}`);
        if (!cancelled && res && !res.error) setPeakHours(res.peak_hours || []);
      } catch {
        if (!cancelled) setPeakHours([]);
      } finally {
        if (!cancelled) setPeakLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [peakRange]);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const [ovRes, topRes, slowRes] = await Promise.all([
          api(`/reports/overview?days=${RANGE_DAYS[range]}`),
          api(`/reports/top-sellers?days=${RANGE_DAYS[range]}`),
          api(`/reports/slow-movers?days=${RANGE_DAYS[range]}`)
        ]);
        if (cancelled) return;
        if (ovRes && !ovRes.error) setOverview(ovRes);
        const top = topRes?.data || [];
        const slow = slowRes?.data || [];
        setTopSellerRows(top.slice(0, 8).map((s) => ({ name: s.name, sold: Number(s.count) || 0, revenue: s.revenue != null ? rs(s.revenue) : '—' })));
        setSlowMoverRows(slow.slice(0, 5).map((s) => ({ name: s.name, sold: Number(s.count) || 0, revenue: s.revenue != null ? rs(s.revenue) : '—' })));
        setLoadError(null);
        setLoadState('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e);
        setLoadState('ready');
      }
    })();
    return () => { cancelled = true; };
  }, [range, tick]);

  const o = overview;
  const hasData = !!(o && o.orders > 0);
  const dailyRevenue = useMemo(() => (o?.daily_revenue || []).map((p) => ({
    date: p.date,
    label: p.date ? new Date(`${p.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) : '',
    sales: Number(p.amount) || 0
  })), [o]);

  const exportCsv = () => {
    const rows = [['Metric', 'Value']];
    if (o) {
      rows.push(['Gross sales', o.sales], ['Orders', o.orders], ['Average order value', Math.round(o.avg_order_value)],
        ['Tax collected', o.tax_collected], ['Discounts given', o.discounts_given],
        ['Refunds', o.refunds_total], ['Refund count', o.refunds_count], ['Net sales', o.net_sales]);
      (o.payment_mix || []).forEach((m) => rows.push([`Payment · ${m.method}`, m.amount]));
      (o.top_products || []).forEach((p) => rows.push([`Product · ${p.name}`, p.count]));
      (o.table_usage || []).forEach((t) => rows.push([`Table ${t.table}`, t.revenue]));
    }
    downloadCsv(`sales-report-${range.toLowerCase().replace(' ', '-')}-${today()}.csv`, rows);
    toast('Report exported as CSV', { tone: 'green' });
  };

  const Kpis = [
    { label: 'Gross sales', value: o ? rs(o.sales) : '—', meta: `${o ? o.orders.toLocaleString() : '—'} orders` },
    { label: 'Avg order value', value: o ? rs(o.avg_order_value) : '—', meta: 'per settled transaction' },
    { label: 'Tax collected', value: o ? rs(o.tax_collected) : '—', meta: 'VAT on sales' },
    { label: 'Refunds', value: o ? rs(o.refunds_total) : '—', meta: `${o ? o.refunds_count : 0} issued` }
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Reports" descriptor="Sales, payments and product performance for the selected period">
        <div className="relative">
          {rangeOpen && <div className="fixed inset-0 z-30" onClick={() => setRangeOpen(false)} />}
          <Button variant="outline" icon={<CalendarIcon className="h-4 w-4" />} onClick={() => setRangeOpen((v) => !v)}>
            {range}
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
          {rangeOpen &&
          <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
              {RANGE_OPTIONS.map((r) => (
                <button
                key={r}
                type="button"
                onClick={() => { setRange(r); setRangeOpen(false); }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors duration-150 ease-soft ${
                r === range ? 'bg-ink text-white' : 'text-ink hover:bg-canvas'}`}>
                  {r}
                  {r === range && <Pill tone="blue">Current</Pill>}
                </button>
              ))}
            </div>
          }
        </div>
        <Button variant="dark" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportCsv} disabled={!o}>
          Export CSV
        </Button>
      </PageHeader>

      {loadState === 'loading' ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface px-4 py-3.5">
              <span className="block h-3 w-20 animate-pulse rounded bg-canvas" />
              <span className="mt-2 block h-8 w-28 animate-pulse rounded bg-canvas" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* KPI band — the numbers the owner asks for first */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3.5">
                <p className="text-caption font-semibold text-meta">{k.label}</p>
                <p className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-ink">{k.value}</p>
                {k.meta && <p className="mt-0.5 text-xs text-meta">{k.meta}</p>}
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-accent">{periodLabel}</p>
              </div>
            ))}
          </div>

          {loadError && (
            <div className="mt-4 rounded-xl border border-status-red/30 bg-tint-red px-4 py-4">
              <p className="text-sm font-bold text-status-red">
                {loadError.code === 'EMAIL_NOT_VERIFIED'
                  ? 'Email verification required'
                  : loadError.status === 403
                    ? 'Reports need a manager session'
                    : loadError.status === 401
                      ? 'Session expired'
                      : 'Couldn’t load Reports'}
              </p>
              <p className="mt-1 text-13 text-status-red/90">
                {loadError.code === 'EMAIL_NOT_VERIFIED'
                  ? 'Your boss account needs a verified email before reports open — check your inbox for the 6-digit code or head to Verify email.'
                  : loadError.status === 403
                    ? "Your current role can't read sales reports — sign in or switch to a Manager or Admin session."
                    : loadError.status === 401
                      ? 'Clock in again to refresh the reports data.'
                      : (loadError.message || 'The reports service did not respond.')}
              </p>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)}>Retry</Button>
              </div>
            </div>
          )}

          {!hasData && !loadError &&
          <div className="mt-4">
              <EmptyState
            title="No sales in this period"
            description="Settle a payment in Register or Front of House and the numbers here will build themselves."
            action={
              loadState === 'ready' && !o
                ? <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
                : undefined
            } />
            </div>
          }

          {hasData &&
          <>
              {dailyRevenue.length > 1 &&
          <Card className="mt-6 p-6">
                  <h3 className="text-base font-bold tracking-tight text-ink">Sales over time</h3>
                  <p className="text-caption font-medium text-meta">
                    Daily settled revenue
                  </p>
                  <div className="mt-4">
                    <TrendChart
                  data={dailyRevenue}
                  valueKey="sales"
                  seriesLabel="Sales"
                  labelEvery={dailyRevenue.length > 14 ? 5 : 1}
                  height={240}
                  formatY={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                  formatValue={rs}
                  formatTitle={(row) => row.date || row.label} />
                  </div>
                </Card>
          }

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <PaymentMixCard mix={o.payment_mix} totalSales={o.sales} />
                <MoneyOutCard
              taxCollected={o.tax_collected}
              discounts={o.discounts_given}
              refundsTotal={o.refunds_total}
              refundsCount={o.refunds_count}
              netSales={o.net_sales} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <PeakHoursCard hours={peakHours} peakRange={peakRange} onPeakRangeChange={setPeakRange} loading={peakLoading} />
                <TableUsageCard usage={o.table_usage} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <TopSellersCard rows={topSellerRows.length > 0 ? topSellerRows : (o.top_products || []).map((p) => ({ name: p.name, sold: p.count, revenue: p.revenue ? rs(p.revenue) : '—' }))} />
                <SlowMoversCard rows={slowMoverRows} />
              </div>
            </>
          }

          {!hasData && (topSellerRows.length > 0 || slowMoverRows.length > 0) &&
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <TopSellersCard rows={topSellerRows} />
              <SlowMoversCard rows={slowMoverRows} />
            </div>
          }
        </>
      )}
    </div>
  );
}
