import { useMemo, useState } from 'react';
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  DownloadIcon,
  EqualIcon,
  MegaphoneIcon,
  ReceiptIcon } from
'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { FilterChips } from '../components/ui/Controls';
import { TrendChart } from '../components/ui/TrendChart';
import { useToast } from '../components/ui/Toast';
import { slowMovers, topSellers } from '../data/business';

const WEEK_REV = [62000, 58400, 71200, 86400, 104800, 118600, 81200];
const HOUR_F = [0.06, 0.04, 0.05, 0.08, 0.12, 0.18, 0.28, 0.45, 0.62, 0.78, 0.85, 0.92, 0.88, 0.72, 0.55, 0.42, 0.34, 0.3];
const HOUR_LABELS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'];
const MONTH_F = [0.62, 0.55, 0.7, 0.9, 1.0, 1.08, 1.02, 0.95, 1.1, 1.2, 1.15, 0.85];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEPT_10 = new Date('2026-09-10T12:00:00');

const PHRASE = {
  '7d': 'in the last 7 days',
  today: 'today',
  '28d': 'in the last 28 days',
  '1y': 'in the last 12 months',
};
const LABEL_EVERY = { '7d': 1, today: 3, '28d': 5, '1y': 1 };

const rs = (n) => `Rs ${n.toLocaleString('en-IN')}`;

function seeded(seedInt) {
  let s = seedInt >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dkey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DLAB = (d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
const fullDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

function normalize(rows, target) {
  const sum = rows.reduce((s, d) => s + d.sales, 0);
  if (!sum) return rows;
  const scaled = rows.map((d) => Math.round((d.sales * target) / sum / 100) * 100);
  const diff = target - scaled.reduce((s, d) => s + d.sales, 0);
  const last = scaled.length - 1;
  scaled[last] = Math.max(0, scaled[last] + diff);
  return rows.map((d, i) => ({ ...d, sales: scaled[i] }));
}

function seriesFor(range) {
  if (range === 'today') {
    const total = HOUR_F.reduce((a, b) => a + b, 0);
    return normalize(
      HOUR_LABELS.map((h, i) => ({ label: h, sales: Math.round((86400 * HOUR_F[i]) / total / 100) * 100 })),
      86400
    );
  }
  if (range === '28d') {
    const rnd = seeded(20260814);
    const rows = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date('2026-08-14T12:00:00');
      d.setDate(d.getDate() + i);
      const dow = (d.getDay() + 6) % 7;
      const f = dow >= 5 ? 1.16 : dow >= 3 ? 1.06 : 0.94;
      rows.push({ date: dkey(d), label: DLAB(d), sales: Math.round((75100 * f * (0.9 + 0.22 * rnd())) / 100) * 100 });
    }
    return normalize(rows, 2104100);
  }
  if (range === '1y') {
    const avgF = MONTH_F.reduce((a, b) => a + b, 0) / MONTHS.length;
    return normalize(
      MONTHS.map((m, i) => ({ label: m, sales: Math.round((2670000 * (MONTH_F[i] / avgF)) / 1000) * 1000 })),
      32044200
    );
  }
  return WEEK_REV.map((rev, i) => {
    const d = new Date(SEPT_10);
    d.setDate(d.getDate() + i);
    return { date: dkey(d), label: DLAB(d), sales: rev };
  });
}

const PERIODS = {
  '7d': {
    nav: 'Last 7 days',
    sub: '10–16 Sep',
    title: 'Last 7 days',
    desc: '10–16 Sep · all channels',
    trends: [
      { label: 'Sales', value: 'Rs 5,82,600', tone: 'up', text: '12.4% more than usual', target: 582600 },
      { label: 'Orders', value: '742', tone: 'up', text: '8.9% more than usual' },
      { label: 'New guests', value: '386', tone: 'flat', text: 'about the same as usual' },
      { label: 'Net revenue', value: 'Rs 4,19,200', tone: 'up', text: '10.6% more than usual' }
    ]
  },
  today: {
    nav: 'Today',
    sub: 'Thu 10 Sep',
    title: 'Today',
    desc: 'Thursday 10 Sep · all channels',
    trends: [
      { label: 'Sales', value: 'Rs 86,400', tone: 'up', text: '6.1% more than usual', target: 86400 },
      { label: 'Orders', value: '118', tone: 'up', text: '4.2% more than usual' },
      { label: 'New guests', value: '51', tone: 'flat', text: 'about the same as usual' },
      { label: 'Net revenue', value: 'Rs 62,200', tone: 'up', text: '5.8% more than usual' }
    ]
  },
  '28d': {
    nav: 'Last 28 days',
    sub: '14 Aug–10 Sep',
    title: 'Last 28 days',
    desc: '14 Aug – 10 Sep · all channels',
    trends: [
      { label: 'Sales', value: 'Rs 21,04,100', tone: 'up', text: '9.6% more than usual', target: 2104100 },
      { label: 'Orders', value: '2,640', tone: 'up', text: '7.1% more than usual' },
      { label: 'New guests', value: '1,152', tone: 'up', text: '3.4% more than usual' },
      { label: 'Net revenue', value: 'Rs 15,16,000', tone: 'up', text: '9.0% more than usual' }
    ]
  },
  '1y': {
    nav: 'Last year',
    sub: 'Oct 25–Sep 26',
    title: 'Last 12 months',
    desc: 'Oct 2025 – Sep 2026 · all channels',
    trends: [
      { label: 'Sales', value: 'Rs 3,20,44,200', tone: 'up', text: '18.2% more than usual', target: 32044200 },
      { label: 'Orders', value: '38,720', tone: 'up', text: '14.5% more than usual' },
      { label: 'New guests', value: '16,480', tone: 'up', text: '12.0% more than usual' },
      { label: 'Net revenue', value: 'Rs 2,36,10,000', tone: 'up', text: '17.4% more than usual' }
    ]
  }
};

const TREND_TONES = {
  up: { cls: 'text-status-green', icon: <ArrowUpRightIcon className="h-3.5 w-3.5" /> },
  down: { cls: 'text-status-red', icon: <ArrowDownRightIcon className="h-3.5 w-3.5" /> },
  flat: { cls: 'text-meta', icon: <EqualIcon className="h-3.5 w-3.5" /> }
};

function TrendStat({ label, value, tone, text, first }) {
  const t = TREND_TONES[tone] || TREND_TONES.flat;
  return (
    <div className={first ? '' : 'lg:border-l lg:border-line lg:pl-8'}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">{label}</p>
      <p className="mt-2 font-mono text-xl font-extrabold tracking-tight text-ink lg:text-2xl">{value}</p>
      <p className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold ${t.cls}`}>
        {t.icon}
        {text}
      </p>
    </div>
  );
}

const MARKER_ICONS = {
  campaign: <MegaphoneIcon className="h-3.5 w-3.5 text-status-amber" />,
  best: <ReceiptIcon className="h-3.5 w-3.5 text-status-blue" />
};

function markersFor(range, series) {
  const best = series.reduce((bi, d, i, a) => (d.sales > a[bi].sales ? i : bi), 0);
  switch (range) {
    case 'today':
      return [
        { index: 6, icon: MARKER_ICONS.best },
        { index: 12, icon: MARKER_ICONS.campaign }
      ];
    case '28d':
      return [
        { index: 8, icon: MARKER_ICONS.campaign },
        { index: 25, icon: MARKER_ICONS.campaign },
        { index: best, icon: MARKER_ICONS.best }
      ];
    case '1y':
      return [
        { index: 1, icon: MARKER_ICONS.campaign },
        { index: 8, icon: MARKER_ICONS.campaign },
        { index: best, icon: MARKER_ICONS.best }
      ];
    default:
      return [
        { index: 2, icon: MARKER_ICONS.campaign },
        { index: best, icon: MARKER_ICONS.best }
      ];
  }
}

function RankedList({ title, descriptor, rows }) {
  const max = Math.max(...rows.map((r) => r.sold));
  return (
    <Card>
      <div className="mb-4 flex items-end justify-between">
        <h3 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">{title}</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-meta">{descriptor}</span>
      </div>
      <ul className="space-y-3">
        {rows.map((r, i) =>
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-2.5">
                <span className="font-mono text-xs text-meta">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm font-semibold text-ink">{r.name}</span>
              </span>
              <span className="font-mono text-sm text-meta">{r.sold} · {r.revenue}</span>
            </div>
            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-canvas">
              <span className="block h-full rounded-full bg-ink/80" style={{ width: `${r.sold / max * 100}%` }} />
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

export function Reports() {
  const [range, setRange] = useState('7d');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState('PDF');
  const [recurrence, setRecurrence] = useState('Off');
  const toast = useToast();

  const period = PERIODS[range];
  const series = useMemo(() => seriesFor(range), [range]);
  const markers = useMemo(() => markersFor(range, series), [range, series]);

  const totalSales = useMemo(() => series.reduce((s, d) => s + d.sales, 0), [series]);
  const headline = `Your store made ${rs(totalSales)} ${PHRASE[range]}.`;

  const handleExport = () => {
    const ext = format === 'PDF' ? 'pdf' : 'csv';
    const rec = recurrence === 'Off' ? '' : `-${recurrence.toLowerCase()}`;
    toast(`Report exported · ex-report${rec}.${ext}`, { tone: 'green' });
    setExportOpen(false);
  };

  const scrollDetail = () =>
    document.getElementById('reports-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const navOrder = ['7d', 'today', '28d', '1y'];

  const chartTitle = (row) => (range === 'today' ? `${row.label} today` : row.date ? fullDate(row.date) : row.label);
  const chartY = (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Reports" descriptor={period.desc}>
        <div className="relative">
          {rangeOpen &&
          <div className="fixed inset-0 z-30" onClick={() => setRangeOpen(false)} />
          }
          <Button variant="outline" icon={<CalendarIcon className="h-4 w-4" />} onClick={() => setRangeOpen((o) => !o)}>
            {period.nav}
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
          {rangeOpen &&
          <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
              {navOrder.map((key) => {
              const p = PERIODS[key];
              const active = range === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setRange(key); setRangeOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-soft ${
                  active ? 'bg-ink text-white' : 'text-ink hover:bg-canvas'}`}>
                  
                    <span className="text-sm font-semibold">{p.nav}</span>
                    <span className={`shrink-0 text-[11px] ${active ? 'text-white/60' : 'text-meta'}`}>{p.sub}</span>
                  </button>);

              })}
            </div>
          }
        </div>
        <Button variant="dark" icon={<DownloadIcon className="h-4 w-4" />} onClick={() => setExportOpen(true)}>
          Export
        </Button>
      </PageHeader>

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export report"
        subtitle={period.desc}
        footer={
          <>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button variant="dark" onClick={handleExport}>Confirm export</Button>
          </>
        }>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Format</p>
            <FilterChips options={['PDF', 'CSV']} value={format} onChange={setFormat} />
          </div>
          <div className="rounded-xl border border-line bg-canvas px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Date range</p>
            <p className="mt-1 text-sm font-semibold text-ink">{period.sub}</p>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Email this report</p>
            <FilterChips options={['Off', 'Daily', 'Weekly']} value={recurrence} onChange={setRecurrence} />
          </div>
        </div>
      </Dialog>

      <div className="min-w-0 space-y-6">
          <Card className="p-7 lg:p-8">
            <h2 className="max-w-3xl text-2xl font-extrabold leading-snug tracking-tight text-ink">{headline}</h2>

            <div className="mt-9">
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
                {period.trends.map((t, i) =>
                  <TrendStat key={t.label} {...t} first={i === 0} />
                )}
              </div>
            </div>

            <div className="mt-2">
              <TrendChart
                data={series}
                valueKey="sales"
                seriesLabel="Sales"
                markers={markers}
                labelEvery={LABEL_EVERY[range]}
                height={280}
                formatY={chartY}
                formatValue={rs}
                formatTitle={chartTitle} />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={scrollDetail}
                className="inline-flex items-center gap-1 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
                See more
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </Card>

          <div id="reports-detail" className="grid scroll-mt-24 gap-5 lg:grid-cols-2">
            <RankedList title="Top sellers" descriptor="Best 5" rows={topSellers} />
            <RankedList title="Slowest movers" descriptor="Review or cut" rows={slowMovers} />
          </div>
        </div>
    </div>
  );
}