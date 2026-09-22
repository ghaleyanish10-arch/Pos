import React from 'react';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  ShoppingBagIcon,
  UserIcon,
  UtensilsCrossedIcon,
  XIcon
} from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { AIBadge, CountBadge, Pill, StatusDot, TypeBadge } from '../components/ui/Pill';
import { Button } from '../components/ui/Button';
import { FilterChips, SearchInput, Tabs } from '../components/ui/Controls';
import { Drawer } from '../components/ui/Drawer';
import { LoadingState } from '../components/ui/LoadingState';
import { useToast } from '../components/ui/Toast';
import { useSound } from '../state/SoundContext';
import { useOrders } from '../state/OrderContext';
import { useDevice } from '../state/DeviceContext';
import { api } from '../api/client';
import {
  normalizeTicket,
  shortId,
  elapsedMinutes,
  SLA_MINUTES,
  useElapsedClock
} from '../api/normalize';

// Operational ladder — the statuses staff act on, in workflow order.
const PIPELINE = [
  { key: 'new', label: 'New', tone: 'blue' },
  { key: 'confirmed', label: 'Confirmed', tone: 'purple' },
  { key: 'preparing', label: 'Preparing', tone: 'amber' },
  { key: 'ready', label: 'Ready', tone: 'green' },
  { key: 'served', label: 'Served', tone: 'blue' },
  { key: 'completed', label: 'Completed', tone: 'neutral' },
  { key: 'cancelled', label: 'Cancelled', tone: 'red' }
];

const KEY_ORDER = { new: 0, confirmed: 1, preparing: 2, ready: 3, served: 4, completed: 5, cancelled: 6 };

// What "advance" means from each status → the single next action.
const RULES = {
  new: { next: 'confirmed', label: 'Confirm', hint: 'Accept and queue for the kitchen' },
  confirmed: { next: 'preparing', label: 'Start cooking', hint: 'Fire the order' },
  preparing: { next: 'ready', label: 'Mark ready', hint: 'Done — ready to go out' },
  ready: { next: 'served', label: '', hint: 'Hand the order to the guest' },
  served: { next: 'completed', label: 'Complete', hint: 'Close out this order' },
  completed: { next: 'confirmed', label: 'Reopen', hint: 'Pull it back into the pipeline' },
  cancelled: { next: 'new', label: 'Restore', hint: 'Bring it back as a new order' }
};

const READY_LABELS = { 'dine-in': 'Mark served', takeaway: 'Hand off', delivery: 'Out for delivery' };

const ladderStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'incoming') return 'new';
  return KEY_ORDER[v] !== undefined ? v : 'new';
};

const toLines = (items) =>
  (items || []).map((it) =>
    typeof it === 'string' ? it : `${it.qty > 1 ? `${it.qty}x ` : ''}${it.name}`
  );

// Stable identity for a ticket: which table + exactly which lines. Used to
// collapse the instant local ticket (OrderContext) with the persisted backend
// copy so an order never appears twice.
const ticketKey = (t) => {
  const table = String(t?.table || '').trim().toLowerCase();
  const items = toLines(t?.items)
    .map((s) => s.replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase())
    .sort()
    .join('|');
  return `${table}::${items}`;
};

const customerLabel = (t) => {
  if (t.customer && String(t.customer).trim() && t.customer !== 'Walk-in') return t.customer;
  const ty = String(t.type || 'dine-in').toLowerCase();
  if (ty === 'delivery') return 'Phone order';
  // Takeaway already shows as the source label — don't print it twice.
  if (ty === 'takeaway') return 'Walk-in guest';
  return 'Walk-in';
};

const tableLabel = (t) => {
  const tbl = String(t.table || '').trim();
  if (tbl && tbl !== '—') return tbl;
  const ty = String(t.type || 'dine-in').toLowerCase();
  if (ty === 'delivery') return '—';
  if (ty === 'takeaway') return '—';
  return '—';
};

const orderTotal = (t) => {
  const items = t.items || [];
  if (!items.length || typeof items[0] === 'string') return '—';
  const sum = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  return sum > 0 ? `Rs ${Math.round(sum).toLocaleString('en-IN')}` : '—';
};

const placedAt = (t) => {
  if (t.timestamps && t.timestamps.placed) return t.timestamps.placed;
  if (t.created_at) {
    const d = new Date(t.created_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }
  return '';
};

const typeIcon = (t) => {
  const ty = String(t.type || 'dine-in').toLowerCase();
  if (ty === 'delivery') return <PhoneIcon className="h-3.5 w-3.5" />;
  if (ty === 'takeaway') return <ShoppingBagIcon className="h-3.5 w-3.5" />;
  return <UtensilsCrossedIcon className="h-3.5 w-3.5" />;
};

const nextActionOf = (t) => {
  const s = ladderStatus(t.status);
  if (s === 'ready') return { to: 'served', label: READY_LABELS[t.type] || READY_LABELS['dine-in'] };
  return { to: RULES[s].next, label: RULES[s].label };
};

const prevOf = (s) => {
  const i = KEY_ORDER[s];
  const candidates = ['new', 'confirmed', 'preparing', 'ready', 'served'];
  return i > 0 ? candidates[i - 1] : null;
};

function EmptyState({ onClear, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-shelf border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{children}</p>
      <p className="mt-1 text-sm text-meta">Nothing to act on right now.</p>
      {onClear && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function OrderRow({ t, held, isOverdue, actions }) {
  const { primary, undo, pause, cancel } = actions(t);
  const items = toLines(t.items);
  const visible = items.slice(0, 3);
  const more = items.length - visible.length;
  const tone = PIPELINE.find((p) => p.key === ladderStatus(t.status)).tone;
  const customer = customerLabel(t);
  const table = tableLabel(t);

  return (
    <article
      onClick={() => primary.detail()}
      className={`cursor-pointer rounded-card border bg-surface transition-shadow duration-150 ease-soft hover:shadow-card ${
        isOverdue ? 'border-status-red/60' : 'border-line'
      }`}>
      <div className="grid gap-x-5 gap-y-3 p-4 lg:grid-cols-[172px_minmax(160px,200px)_minmax(0,1fr)_auto_110px_auto] lg:items-center">
        {/* order number + status + badges */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xl font-black tracking-tight text-ink">{shortId(t.id)}</p>
            {held && (
              <span className="inline-flex items-center gap-1 rounded-full border border-status-amber/30 bg-tint-amber px-2 py-0.5 text-caption font-semibold text-status-amber">
                <PauseIcon className="h-3 w-3" /> Paused
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={tone} dot>
              {PIPELINE.find((p) => p.key === ladderStatus(t.status)).label}
            </Pill>
            <TypeBadge type={t.type} />
            {t.ai && <AIBadge label="Phone order" />}
          </div>
        </div>

        {/* table + customer */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-bold text-ink">
            {typeIcon(t)}
            <span className="truncate">
              {table !== '—' ? `Table ${table}` : String(t.type || 'dine-in').toLowerCase() === 'delivery'
                ? 'Delivery'
                : String(t.type || 'dine-in').toLowerCase() === 'takeaway'
                  ? 'Takeaway'
                  : 'Walk-in'}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-meta">
            <UserIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{customer}</span>
          </span>
        </div>

        {/* items */}
        <div className="min-w-0 text-sm">
          {visible.map((line) => (
            <p key={line} className="truncate text-ink">
              {line}
            </p>
          ))}
          {more > 0 && <p className="font-semibold text-meta">+{more} more</p>}
          {t.allergy && (
            <p className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-status-red/25 bg-tint-red px-2 py-1 text-xs font-bold text-status-red">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-red" aria-hidden="true" />
              <span className="truncate">{t.allergy}</span>
            </p>
          )}
        </div>

        {/* age */}
        <div className="flex flex-col items-start lg:items-end">
          <span className={`flex items-center gap-1.5 font-mono text-sm font-bold ${isOverdue ? 'text-status-red' : 'text-ink'}`}>
            {isOverdue && <span className="h-2 w-2 rounded-full bg-status-red" aria-hidden="true" />}
            {t.elapsed}
          </span>
          <span className="font-mono text-caption text-meta">
            {placedAt(t) ? `placed ${placedAt(t)}` : ''}
          </span>
        </div>

        {/* total */}
        <div className="text-left lg:text-right">
          <p className="font-mono text-lg font-black text-ink">{orderTotal(t)}</p>
        </div>

        {/* next action */}
        <div className="flex items-center justify-between gap-1.5 lg:justify-end">
          <Button variant="dark" size="md" onClick={primary.run} className="min-w-[128px]">
            {primary.label}
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {undo && (
              <button
                type="button"
                aria-label="Move back one step"
                title={undo.label}
                onClick={undo.run}
                className="icon-btn h-9 w-9 border border-line text-meta hover:text-ink">
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
            )}
            {pause && (
              <button
                type="button"
                aria-label={pause.label}
                title={pause.label}
                onClick={pause.run}
                className="icon-btn h-9 w-9 border border-line text-meta hover:text-ink">
                {pause.on ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
              </button>
            )}
            {cancel && (
              <button
                type="button"
                aria-label="Cancel this order"
                title={`Cancel ${shortId(t.id)}`}
                onClick={cancel.run}
                className="icon-btn h-9 w-9 border border-line text-status-red/70 hover:border-status-red hover:text-status-red">
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

const PIPELINE_TONE_DOT = {
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  green: 'bg-status-green',
  red: 'bg-status-red',
  purple: 'bg-status-purple'
};

function RoundBtn({ label, onClick, children, danger }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-surface transition-colors duration-150 ease-soft active:bg-canvas sm:h-10 sm:w-10 ${
        danger ? 'border-status-red/30 text-status-red/70' : 'border-line text-meta'
      }`}>
      {children}
    </button>
  );
}

function PhoneOrderRow({ t, held, isOverdue, actions }) {
  const { primary, undo, pause, cancel } = actions(t);
  const items = toLines(t.items);
  const visible = items.slice(0, 2);
  const more = items.length - visible.length;
  const tone = PIPELINE.find((p) => p.key === ladderStatus(t.status)).tone;
  const customer = customerLabel(t);
  const table = tableLabel(t);
  const ty = String(t.type || 'dine-in').toLowerCase();
  const tableText = table !== '—'
    ? `Table ${table}`
    : ty === 'delivery' ? 'Delivery' : ty === 'takeaway' ? 'Takeaway' : 'Walk-in';

  return (
    <article
      onClick={() => primary.detail()}
      className={`cursor-pointer rounded-card border bg-surface transition-shadow duration-150 ease-soft ${
        isOverdue ? 'border-status-red/60' : 'border-line'
      }`}>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="font-mono text-lg font-black tracking-tight text-ink">{shortId(t.id)}</p>
            {held && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-status-amber/30 bg-tint-amber px-2 py-0.5 text-caption font-semibold text-status-amber">
                <PauseIcon className="h-3 w-3" /> Paused
              </span>
            )}
          </div>
          <span className={`flex shrink-0 items-center gap-1.5 font-mono text-sm font-bold ${isOverdue ? 'text-status-red' : 'text-ink'}`}>
            {isOverdue && <span className="h-2 w-2 rounded-full bg-status-red" aria-hidden="true" />}
            {t.elapsed}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone={tone} dot>{PIPELINE.find((p) => p.key === ladderStatus(t.status)).label}</Pill>
          <TypeBadge type={t.type} />
          {t.ai && <AIBadge label="Phone order" />}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
            {typeIcon(t)}
            <span className="truncate">{tableText}</span>
          </span>
          <span className="shrink-0 font-mono text-lg font-black text-ink">{orderTotal(t)}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-meta">
          <UserIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{customer}</span>
        </p>

        <div className="mt-2.5 space-y-0.5">
          {visible.map((line) => (
            <p key={line} className="truncate text-xs text-ink">{line}</p>
          ))}
          {more > 0 && <p className="text-xs font-semibold text-meta">+{more} more</p>}
        </div>

        {t.allergy && (
          <p className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-status-red/25 bg-tint-red px-2 py-1 text-xs font-bold text-status-red">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-red" aria-hidden="true" />
            <span className="truncate">{t.allergy}</span>
          </p>
        )}

        <div className="mt-3 flex items-stretch gap-1.5">
          <Button variant="dark" size="md" onClick={primary.run} className="flex-1">
            {primary.label}
          </Button>
          {undo && <RoundBtn label={undo.label} onClick={undo.run}><ArrowLeftIcon className="h-4 w-4" /></RoundBtn>}
          {pause && (
            <RoundBtn label={pause.label} onClick={pause.run}>
              {pause.on ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            </RoundBtn>
          )}
          {cancel && <RoundBtn danger label={`Cancel ${shortId(t.id)}`} onClick={cancel.run}><XIcon className="h-4 w-4" /></RoundBtn>}
        </div>
      </div>
    </article>
  );
}

export function Orders() {
  const toast = useToast();
  const { play } = useSound();
  const { isPhone } = useDevice();
  const [statusTab, setStatusTab] = React.useState('All');
  const [typeFilter, setTypeFilter] = React.useState('All orders');
  const [query, setQuery] = React.useState('');
  const [tickets, setTickets] = React.useState(null);
  const [pausedIds, setPausedIds] = React.useState([]);
  const [detailTicket, setDetailTicket] = React.useState(null);
  const searchRef = React.useRef(null);
  const { incoming: liveIncoming, removeIncoming } = useOrders();

  const load = React.useCallback(async () => {
    try {
      const res = await api('/kds/tickets');
      const list = res?.data || [];
      // Honest board: whatever the server returns — even an empty list. The
      // static demo tickets only live on the reset demo file; a real order
      // board must never show dishes that were never ordered.
      setTickets(list.map(normalizeTicket));
    } catch {
      // Offline board: drop the server view to empty so only genuine local
      // (offline) tickets from OrderContext show, never fictional ones.
      setTickets([]);
    }
  }, []);

  // Keep ages live + refresh on focus (QR orders appear on their own).
  const tick = useElapsedClock(15000);
  React.useEffect(() => {
    load();
  }, [load, tick]);
  React.useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Global keys: "/" focuses search like the register.
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commit = (t, to) => {
    setTickets((prev) =>
      (prev || []).map((x) =>
        x.id === t.id
          ? { ...x, status: to, fired: to === 'preparing' ? true : x.fired }
          : x
      )
    );
  };

  const setStatus = React.useCallback(async (t, to) => {
    const isLocal = liveIncoming.some((x) => x.id === t.id);
    commit(t, to);
    window.dispatchEvent(new CustomEvent('mesa-order-update'));
    if (isLocal) {
      // A local (offline) ticket can't be persisted server-side; once it
      // leaves "new" the backend copy will take over, so drop the local one.
      if (to !== 'new') removeIncoming(t.id);
      return;
    }
    try {
      await api(`/kds/tickets/${t.id}/bump`, { method: 'PUT', body: { status: to } });
      window.dispatchEvent(new CustomEvent('mesa-order-update'));
    } catch {
      /* offline — optimistic bump, reload reconciles */
    }
  }, [liveIncoming, removeIncoming]);

  const moveBack = (t) => {
    const prev = prevOf(ladderStatus(t.status));
    if (!prev) return;
    setStatus(t, prev);
    toast(`Order ${shortId(t.id)} moved back to ${RULES[prev].label}`);
  };

  const advance = (t) => {
    const s = ladderStatus(t.status);
    const to = s === 'ready' ? 'served' : RULES[s].next;
    setStatus(t, to);
    const done =
      to === 'confirmed' ? 'confirmed' :
      to === 'preparing' ? 'started cooking' :
      to === 'ready' ? 'marked ready' :
      to === 'served' ? 'served' :
      to === 'completed' ? 'completed' :
      'updated';
    play('orderStatus');
    if (to === 'ready') play('kdsReady');
    toast.success(`Order ${shortId(t.id)} ${done}`);
  };

  const cancelOrder = (t) => {
    const prev = ladderStatus(t.status);
    setStatus(t, 'cancelled');
    play('warning');
    toast(`Order ${shortId(t.id)} cancelled`, {
      undo: () => setStatus(t, prev)
    });
  };

  const togglePause = (t) => {
    const paused = pausedIds.includes(t.id);
    setPausedIds((prev) => (paused ? prev.filter((x) => x !== t.id) : [...prev, t.id]));
    toast(`Order ${shortId(t.id)} ${paused ? 'resumed' : 'paused'}`);
  };

  // Merge: backend tickets + local (offline) tickets the backend hasn't seen.
  const all = (tickets || []).map((t) => ({ ...t, status: ladderStatus(t.status) }));
  const backendKeys = new Set(all.map(ticketKey));
  const localIncoming = liveIncoming
    .filter((t) => !backendKeys.has(ticketKey(t)))
    .map((t) => ({ ...t, status: 'new', station: t.station || 'Kitchen' }));
  const merged = [...all, ...localIncoming];

  const matchesQuery = (t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      t.id,
      t.table,
      t.tag,
      t.customer,
      customerLabel(t),
      t.server,
      String(t.type || '')
    ]
      .concat(toLines(t.items))
      .concat(t.modifiers || [])
      .concat(t.allergy || '')
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  };

  const matchesType = (t) =>
    typeFilter === 'All orders' ||
    String(t.type || 'dine-in').toLowerCase() === typeFilter.toLowerCase();

  const filtered = merged.filter((t) => matchesQuery(t) && matchesType(t));

  const countByStatus = React.useMemo(() => {
    const counts = Object.fromEntries(PIPELINE.map((p) => [p.key, 0]));
    counts.All = filtered.length;
    filtered.forEach((t) => {
      const s = ladderStatus(t.status);
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  const byAge = (a, b) => elapsedMinutes(a.elapsed) - elapsedMinutes(b.elapsed);
  const sortedForTab = (rows) => {
    const paused = rows.filter((t) => pausedIds.includes(t.id)).sort(byAge);
    const active = rows.filter((t) => !pausedIds.includes(t.id)).sort(byAge);
    return [...paused, ...active];
  };

  let visible;
  if (statusTab === 'All') {
    visible = PIPELINE.map((p) => ({
      statusKey: p.key,
      rows: sortedForTab(filtered.filter((t) => ladderStatus(t.status) === p.key))
    })).filter((g) => g.rows.length > 0);
  } else {
    visible = [{
      statusKey: statusTab,
      rows: sortedForTab(filtered.filter((t) => ladderStatus(t.status) === statusTab))
    }];
  }

  const shown = statusTab === 'All' ? filtered : filtered.filter((t) => ladderStatus(t.status) === statusTab);
  const activeCount = ['new', 'confirmed', 'preparing', 'ready'].reduce(
    (n, k) => n + (countByStatus[k] || 0), 0
  );

  const buildActions = (t) => {
    const s = ladderStatus(t.status);
    const next = nextActionOf(t);
    const primary = {
      label: next.label,
      run: (e) => { e.stopPropagation(); advance(t); },
      detail: () => setDetailTicket(t)
    };
    let undo = null;
    if (s !== 'new' && s !== 'cancelled') {
      undo = { label: 'Move back', run: (e) => { e.stopPropagation(); moveBack(t); } };
    }
    let pause = null;
    if (s === 'new' || s === 'confirmed') {
      const paused = pausedIds.includes(t.id);
      pause = { label: paused ? 'Resume' : 'Pause order', on: paused, run: (e) => { e.stopPropagation(); togglePause(t); } };
    }
    let cancel = null;
    if (s === 'new' || s === 'confirmed' || s === 'preparing' || s === 'ready') {
      cancel = { run: (e) => { e.stopPropagation(); cancelOrder(t); } };
    }
    return { primary, undo, pause, cancel };
  };

  const detailStatus = detailTicket && ladderStatus(detailTicket.status);
  const detailRule = detailTicket && RULES[detailStatus];
  const detailNext = detailTicket && nextActionOf(detailTicket);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Orders" descriptor="Live order pipeline">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-tint-blue px-3 py-1 text-sm font-bold text-status-blue">
            {activeCount} active
          </span>
          {!isPhone && (
            <span className="flex items-center gap-1.5 text-caption font-semibold text-meta">
              <kbd className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs font-bold">/</kbd>
              to search
            </span>
          )}
        </div>
      </PageHeader>

      {isPhone ? (
        <>
          {/* phone: stacked search + source scroller */}
          <div className="mb-3 space-y-2">
            <SearchInput
              className="w-full"
              placeholder="Search order, table, guest, item…"
              value={query}
              onChange={setQuery}
              inputRef={searchRef} />
            <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {['All orders', 'Dine-in', 'Takeaway', 'Delivery'].map((o) => {
                const active = typeFilter === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setTypeFilter(o)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors duration-150 ease-soft ${
                      active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta'
                    }`}>
                    {o}
                  </button>
                );
              })}
            </div>
          </div>

          {/* phone: sticky status chips keep the ladder reachable while scrolling */}
          <div className="scroll-thin sticky top-16 z-20 mb-3 flex gap-2 overflow-x-auto bg-canvas/85 px-1 py-2 backdrop-blur">
            {['All', ...PIPELINE.map((p) => p.key)].map((k) => {
              const isAll = k === 'All';
              const active = statusTab === (isAll ? 'All' : k);
              const p = isAll ? null : PIPELINE.find((x) => x.key === k);
              const count = isAll ? countByStatus.All : (countByStatus[k] || 0);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusTab(isAll ? 'All' : k)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors duration-150 ease-soft ${
                    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta'
                  }`}>
                  {!isAll && <span className={`h-1.5 w-1.5 rounded-full ${PIPELINE_TONE_DOT[p.tone]}`} aria-hidden="true" />}
                  {isAll ? 'All' : p.label}
                  <span className={`rounded-full px-1.5 text-caption font-semibold ${active ? 'bg-white/20' : 'bg-canvas text-meta'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3">
            <SearchInput
              className="min-w-[220px] flex-1"
              placeholder="Search order, table, guest, allergy, item…"
              value={query}
              onChange={setQuery}
              inputRef={searchRef} />
            <FilterChips
              ariaLabel="Order source"
              options={['All orders', 'Dine-in', 'Takeaway', 'Delivery']}
              value={typeFilter}
              onChange={setTypeFilter} />
            <span className="ml-auto font-mono text-caption font-bold text-meta">
              {shown.length} {shown.length === 1 ? 'order' : 'orders'}
            </span>
          </div>

          {/* status ladder — the operational spine */}
          <div className="mb-4 overflow-x-auto pb-1">
            <Tabs
              options={['All', ...PIPELINE.map((p) => p.label)]}
              value={statusTab === 'All' ? 'All' : PIPELINE.find((p) => p.key === statusTab).label}
              counts={(() => {
                const c = { All: countByStatus.All };
                PIPELINE.forEach((p) => { c[p.label] = countByStatus[p.key] || 0; });
                return c;
              })()}
              onChange={(label) => setStatusTab(label === 'All' ? 'All' : PIPELINE.find((p) => p.label === label).key)} />
          </div>
        </>
      )}

      {/* pipeline strips */}
      <div className="flex flex-col gap-4">
        {tickets === null ? (
          <LoadingState label="Loading the order board…" />
        ) : visible.length === 0 && (
          <EmptyState onClear={() => { setQuery(''); setTypeFilter('All orders'); setStatusTab('All'); }}>
            {query || typeFilter !== 'All orders' ? 'No orders match your search.' : `No ${statusTab === 'All' ? 'orders' : statusTab.toLowerCase()} right now.`}
          </EmptyState>
        )}

        {visible.map((group) => {
          const p = PIPELINE.find((x) => x.key === group.statusKey);
          return (
            <section key={p.key}>
              <header className="mb-2 flex items-center gap-2 px-0.5">
                <StatusDot tone={p.tone} />
                <h2 className="text-xs font-semibold text-ink">{p.label}</h2>
                <CountBadge tone={p.tone}>{group.rows.length}</CountBadge>
                <span className="h-px flex-1 bg-line" />
              </header>
              <div className="flex flex-col gap-2.5">
                {group.rows.map((t) => {
                  const overdue = elapsedMinutes(t.elapsed) > SLA_MINUTES && group.statusKey !== 'completed' && group.statusKey !== 'cancelled';
                  const OrderRowVariant = isPhone ? PhoneOrderRow : OrderRow;
                  return (
                    <OrderRowVariant
                      key={`${ticketKey(t)}::${t.id}`}
                      t={t}
                      held={pausedIds.includes(t.id)}
                      isOverdue={overdue}
                      actions={buildActions} />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* order detail drawer */}
      <Drawer
        open={!!detailTicket}
        onClose={() => setDetailTicket(null)}
        title={detailTicket ? shortId(detailTicket.id) : ''}
        subtitle={detailTicket
          ? `${String(detailTicket.type || 'dine-in').charAt(0).toUpperCase() + String(detailTicket.type || 'dine-in').slice(1)}${detailTicket.table && detailTicket.table !== '—' ? ` · Table ${detailTicket.table}` : ''} · ${customerLabel(detailTicket)}`
          : ''}>
        {detailTicket && (
          <div className="flex flex-col gap-4">
            {/* where it is in the ladder */}
            <div className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-caption font-semibold text-meta">Status</p>
                <Pill tone={PIPELINE.find((p) => p.key === detailStatus).tone} dot>
                  {PIPELINE.find((p) => p.key === detailStatus).label}
                </Pill>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {PIPELINE.filter((p) => p.key !== 'cancelled').map((p, i) => {
                  const cur = detailStatus === 'cancelled' ? -1 : KEY_ORDER[detailStatus];
                  const done = cur > i;
                  const current = cur === i;
                  const tone = current ? p.tone : done ? 'green' : 'neutral';
                  return (
                    <Pill key={p.key} tone={tone} className={current ? 'font-black' : ''}>
                      {done ? '✓ ' : ''}{p.label}
                    </Pill>
                  );
                })}
                {detailStatus === 'cancelled' && (
                  <Pill tone="red" dot>CANCELLED</Pill>
                )}
              </div>
            </div>

            {/* meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-caption font-semibold text-meta">Table</p>
                <p className="mt-0.5 font-bold text-ink">{tableLabel(detailTicket) === '—' ? '—' : `Table ${tableLabel(detailTicket)}`}</p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-caption font-semibold text-meta">Customer</p>
                <p className="mt-0.5 font-bold text-ink">{customerLabel(detailTicket)}</p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-caption font-semibold text-meta">Age</p>
                <p className={`mt-0.5 font-mono font-bold ${elapsedMinutes(detailTicket.elapsed) > SLA_MINUTES && detailStatus !== 'completed' && detailStatus !== 'cancelled' ? 'text-status-red' : 'text-ink'}`}>
                  {detailTicket.elapsed}
                </p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-caption font-semibold text-meta">Total</p>
                <p className="mt-0.5 font-mono font-black text-ink">{orderTotal(detailTicket)}</p>
              </div>
            </div>

            {/* items */}
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-caption font-semibold text-meta">
                Items
                <CountBadge>{(detailTicket.items || []).length}</CountBadge>
              </p>
              <div className="flex flex-col gap-1.5">
                {toLines(detailTicket.items).map((line, i) => (
                  <div key={line} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink">{line}</span>
                    <span className="font-mono text-xs font-bold text-meta">
                      {(detailTicket.items[i] && typeof detailTicket.items[i] === 'object') ? `Rs ${Math.round((Number(detailTicket.items[i].qty) || 0) * (Number(detailTicket.items[i].price) || 0)).toLocaleString('en-IN')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {detailTicket.allergy && (
              <AlertBanner>{detailTicket.allergy}</AlertBanner>
            )}

            {detailTicket.modifiers && detailTicket.modifiers.length > 0 && (
              <div>
                <p className="mb-1.5 text-caption font-semibold text-meta">Modifiers</p>
                <div className="flex flex-col gap-1.5">
                  {detailTicket.modifiers.map((m) => (
                    <p key={m} className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink">{m}</p>
                  ))}
                </div>
              </div>
            )}

            {detailTicket.timestamps && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                {['placed', 'fired', 'served'].map((k) => (
                  <div key={k} className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-caption font-semibold text-meta">{k}</p>
                    <p className="mt-0.5 font-mono font-bold text-ink">{detailTicket.timestamps[k] || '—'}</p>
                  </div>
                ))}
              </div>
            )}

            {detailTicket.payment !== undefined && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-meta">Payment</span>
                <span className="font-semibold text-ink">{detailTicket.payment || '—'}</span>
              </div>
            )}

            {detailTicket.server && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-meta">Took the order</span>
                <span className="font-semibold text-ink">{detailTicket.server}</span>
              </div>
            )}

            <div className="mt-1 border-t border-line pt-3">
              <p className="mb-2 text-caption font-semibold text-meta">
                Next action · {detailRule.hint}
              </p>
              <Button variant="dark" full size="lg" icon={<ChevronRightIcon className="h-4 w-4" />} onClick={() => { advance(detailTicket); setDetailTicket(null); }}>
                {detailStatus === 'completed' ? 'Reopen order' : detailNext.label}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}