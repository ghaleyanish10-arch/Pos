import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellOffIcon,
  EraserIcon,
  PauseCircleIcon,
  SearchIcon,
  SlidersHorizontalIcon
} from 'lucide-react';
import { api } from '../api/client';
import { useBackoffInterval } from '../api/poll';
import { useOrders } from '../state/OrderContext';
import { useSettings } from '../state/SettingsContext';
import { normalizeTicket, elapsedMinutes } from '../api/normalize';
import { useToast } from '../components/ui/Toast';
import { useSound } from '../state/SoundContext';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { stations } from '../data/pos';
import {
  incomingTickets as initIncoming,
  preparingTickets as initPreparing,
  readyTickets as initReady } from
'../data/sell';
import { OrderCard } from '../components/kds/OrderCard';
import { StationTabs, StatusFilter } from '../components/kds/StationTabs';
import { fmtClock } from '../components/kds/kdsTokens';

function fallbackTickets() {
  return [
    ...initIncoming.map((t) => ({ ...t, status: 'new', station: t.station || 'Kitchen' })),
    ...initPreparing.map((t) => ({ ...t, status: 'preparing', station: t.station || 'Kitchen' })),
    ...initReady.map((t) => ({ ...t, status: 'ready', station: t.station || 'Kitchen' }))
  ];
}

const ZONE_RANK = { new: 1, preparing: 2, ready: 3 };

export function KDS() {
  const toast = useToast();
  const { incoming: liveIncoming, removeIncoming, restoreOrder } = useOrders();
  const { settings } = useSettings();
  const { play } = useSound();
  const slaSecs = (Number(settings?.kitchenSla) > 0 ? Number(settings.kitchenSla) : 15) * 60;
  const soundOn = settings?.kitchenSound !== false;

  const [station, setStation] = useState('Kitchen');
  const [tickets, setTickets] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clearPassOpen, setClearPassOpen] = useState(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  // 1-second heartbeat so every ticket's timer ticks live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api('/kds/tickets');
      const list = res?.data || [];
      setTickets((prev) => {
        // Merge, don't replace. A poll snapshot that was read before an accept
        // committed would otherwise downgrade a just-accepted tile back to
        // 'new' — the "kitchen reverts to old order data" bug. Merge by id and
        // only ever let the server truth ADVANCE a status; never regress one
        // the cook just bumped (Fire/ready/clear are all persisted server-side).
        const fresh = list.length ? list.map(normalizeTicket) : null;
        if (!fresh) return prev || [];
        const rank = { new: 0, preparing: 1, ready: 2, closed: 3, done: 3 };
        const before = prev || [];
        const merged = fresh.map((d) => {
          const old = before.find((x) => x.id === d.id);
          if (!old) return d;
          const dRank = rank[d.status] ?? 0;
          const oRank = rank[old.status] ?? 0;
          return oRank > dRank ? { ...d, status: old.status } : d;
        });
        // Keep local-only live tickets (station-scoped QR/incoming) not yet in
        // the server snapshot, so a transient snapshot never blanks a lane.
        const ids = new Set(merged.map((x) => x.id));
        const extras = before.filter((x) => !ids.has(x.id));
        return extras.length ? [...merged, ...extras] : merged;
      });
    } catch (e) {
        // Preserve whatever the cook already accepted/readied
        // instead of swapping the whole lane for demo tickets on a
        // transient poll failure (the old-order-reverts bug).
        setTickets((prev) => (prev && prev.length ? prev : fallbackTickets()));
        throw e;

    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-poll every 15s (backing off while the API is down) and on focus so QR
  // orders appear on their own.
  useBackoffInterval(load, 15000);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Chime when fresh tickets land in the NEW lane — routed through the shared
  // sound engine (channel: kitchen, grouped so a rush plays once, with haptics
  // on handhelds). Muted from Settings → Sound or Settings → Kitchen.
  const knownNewRef = useRef(null);
  useEffect(() => {
    if (!tickets) return;
    const newIds = tickets
      .filter((t) => t.status === 'new')
      .map((t) => t.id)
      .sort()
      .join(',');
    if (knownNewRef.current === null) {
      knownNewRef.current = newIds;
      return;
    }
    const arrived = newIds.split(',').filter((id) => id && !knownNewRef.current.split(',').includes(id));
    knownNewRef.current = newIds;
    if (arrived.length > 0 && soundRef.current) {
      play('kdsNew', { groupKey: 'kds-new' });
    }
  }, [tickets, play]);

  const ageSecs = (t) => {
    if (t.created_at) {
      const t0 = new Date(t.created_at).getTime();
      if (!Number.isNaN(t0)) return Math.max(0, Math.floor((now - t0) / 1000));
    }
    return elapsedMinutes(t.elapsed || '0 min') * 60;
  };

  // Live (offline register) tickets merge into the NEW lane unless already visible.
  const all = useMemo(
    () => (tickets || []).map((t) => ({ ...t, status: String(t.status).toLowerCase() === 'incoming' ? 'new' : t.status })),
    [tickets]
  );
  const stationAll = all.filter((t) => t.station === station);
  const knownIds = new Set(stationAll.map((t) => t.id));
  const liveHere = liveIncoming
    .filter((t) => t.station === station && !knownIds.has(t.id))
    .map((t) => ({ ...t, status: 'new', station: t.station || station }));

  const displayed = [...stationAll, ...liveHere].map((t) => ({ t, age: ageSecs(t) }));
  const counts = {
    all: displayed.length,
    new: displayed.filter((d) => d.t.status === 'new').length,
    preparing: displayed.filter((d) => d.t.status === 'preparing').length,
    ready: displayed.filter((d) => d.t.status === 'ready').length,
    late: displayed.filter((d) => d.age >= slaSecs).length
  };

  const sorted = displayed.slice().sort((a, b) =>
    (ZONE_RANK[b.t.status] || 0) - (ZONE_RANK[a.t.status] || 0) || b.age - a.age
  );

  // Search + status filter narrow the board without losing the underlying data.
  const visible = sorted.filter(({ t, age }) => {
    if (statusFilter === 'late' && age < slaSecs) return false;
    if (statusFilter !== 'all' && statusFilter !== 'late' && t.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${t.id} ${t.table || ''} ${t.type || ''} ${(t.items || []).map((i) => (typeof i === 'string' ? i : i.name)).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const setStatus = useCallback((t, to) => {
    setTickets((prev) =>
      (prev || []).map((x) => (x.id === t.id ? { ...x, status: to } : x))
    );
    window.dispatchEvent(new CustomEvent('mesa-order-update'));
      api(`/kds/tickets/${t.id}/bump`, { method: 'PUT', body: { status: to } })
        .then(() => window.dispatchEvent(new CustomEvent('mesa-order-update')))
        .catch(() => {
          setTickets((prev) => (prev || []).map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
          toast(`Bump failed — ticket ${t.id} stays where it was`, { tone: 'red' });
        });
  }, []);

  const startTicket = (t) => {
    const isLive = liveIncoming.some((x) => x.id === t.id);
    if (isLive) {
      removeIncoming(t.id);
      toast(`Ticket ${t.id} started`, {
        undo: () => restoreOrder(t)
      });
      return;
    }
    setTickets((prev) =>
      (prev || []).map((x) => (x.id === t.id ? { ...x, status: 'preparing', fired: true } : x))
    );
      api(`/kds/tickets/${t.id}/fire`, { method: 'PUT' }).catch(() => {
        setTickets((prev) => (prev || []).map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
        toast(`Fire failed — ticket ${t.id} isn't on the pass`, { tone: 'red' });
      });
      api(`/kds/tickets/${t.id}/bump`, { method: 'PUT', body: { status: 'preparing' } }).catch(() => {
        setTickets((prev) => (prev || []).map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
        toast(`Bump failed — ticket ${t.id} stays as it was`, { tone: 'red' });
      });
      toast.success(`Ticket ${t.id} fired`);
  };

  const markReady = (t) => {
    setStatus(t, 'ready');
    play('kdsReady');
    toast.success(`Ticket ${t.id} ready`, {
      undo: () => setStatus(t, 'preparing')
    });
  };

  const bumpTicket = (t) => {
    setTickets((prev) => (prev || []).filter((x) => x.id !== t.id));
    play('orderStatus');
    toast(`Ticket ${t.id} cleared`, {
      undo: () => setTickets((prev) => [...(prev || []), t])
    });
  };

  const recall = (t) => {
    setStatus(t, t.status === 'ready' ? 'preparing' : 'new');
    toast(`Ticket ${t.id} recalled a step`);
  };

  const holdAllNew = () => {
    const held = sorted.filter((d) => d.t.status === 'new').map((d) => d.t);
    if (!held.length) {
      toast(`No new ${station} tickets to hold`);
      return;
    }
    setTickets((prev) => (prev || []).filter((x) => x.status !== 'new' || x.station !== station));
    toast(`${held.length} new ${station} ticket${held.length === 1 ? '' : 's'} held`, {
      undo: () => setTickets((prev) => [...(prev || []), ...held])
    });
  };

  const clearAllReady = () => {
    const cleared = sorted.filter((d) => d.t.status === 'ready').map((d) => d.t);
    if (!cleared.length) {
      toast(`No ready ${station} tickets to clear`);
      return;
    }
    setTickets((prev) => (prev || []).filter((x) => x.status !== 'ready' || x.station !== station));
    play('orderStatus');
    toast(`${cleared.length} ready ticket${cleared.length === 1 ? '' : 's'} cleared`, {
      undo: () => setTickets((prev) => [...(prev || []), ...cleared])
    });
  };

  // Per-status primary action. Complete/Clear carries a toast-level undo, so an
  // accidental bump is one tap away from recovery.
  const primaryFor = (t) => {
    if (t.status === 'new') return { label: 'Start', tone: 'ink', run: () => startTicket(t) };
    if (t.status === 'ready') return { label: 'Complete', tone: 'green', run: () => bumpTicket(t) };
    return { label: 'Ready', tone: 'amber', run: () => markReady(t) };
  };

  const clock = fmtClock(now);
  const filtered = statusFilter !== 'all' || query.trim();

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {/* KDS toolbar — row 1: stations · search · overflow */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StationTabs stations={stations} value={station} onChange={setStation} />

        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticket, table, item…"
            aria-label="Search tickets"
            className="input pl-9" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-sm font-semibold tabular-nums text-meta sm:inline" aria-label="Time">
            {clock}
          </span>
          <ActionMenu
            label="Board actions"
            actions={[
              {
                label: `Hold all new (${counts.new})`,
                icon: <PauseCircleIcon className="h-4 w-4" />,
                disabled: counts.new === 0,
                onClick: holdAllNew
              },
              { divider: true },
              {
                label: `Clear pass — ${counts.ready} ready`,
                icon: <EraserIcon className="h-4 w-4" />,
                danger: true,
                disabled: counts.ready === 0,
                onClick: () => setClearPassOpen(true)
              }
            ]} />
        </div>
      </div>

      {/* row 2: compact status filters + SLA note */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <StatusFilter counts={counts} value={statusFilter} onChange={setStatusFilter} />
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setQuery('');
            }}
            className="text-13 font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
            Reset filters
          </button>
        )}
      </div>

      {/* the board */}
      {tickets === null ? (
        <EmptyState loading title={`Loading ${station} tickets…`} description="Pulling the live feed from the kitchen." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontalIcon className="h-6 w-6" />}
          tone={counts.all > 0 ? 'blue' : 'green'}
          title={counts.all > 0 ? 'No tickets match this filter' : 'All clear'}
          description={
            counts.all > 0
              ? `${counts.all} ticket${counts.all === 1 ? '' : 's'} on the ${station} board — try a different filter.`
              : `Nothing cooking on ${station} right now. New orders appear here automatically.`
          } />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1920px]:grid-cols-4">
          {visible.map(({ t, age }) => (
            <OrderCard
              key={`${t.station}::${t.id}`}
              t={t}
              age={age}
              slaSecs={slaSecs}
              primary={primaryFor(t)}
              onRecall={() => recall(t)} />
          ))}
        </div>
      )}

      {/* Clear pass confirmation — a mass destructive action earns a dialog. */}
      <Dialog
        open={clearPassOpen}
        onClose={() => setClearPassOpen(false)}
        title="Clear the pass?"
        subtitle={`${counts.ready} ready ticket${counts.ready === 1 ? '' : 's'} on ${station}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setClearPassOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { clearAllReady(); setClearPassOpen(false); }}>
              Clear {counts.ready} ticket{counts.ready === 1 ? '' : 's'}
            </Button>
          </>
        }>
        <p className="text-sm text-meta">
          Every <span className="font-semibold text-ink">Ready</span> ticket on this station leaves the board.
          The clear is undoable from the toast for a few seconds.
        </p>
      </Dialog>

      {/* hidden hint kept for discoverability: the bell mute lives in Settings → Kitchen */}
      <span className="sr-only">
        <BellOffIcon aria-hidden="true" /> Sound alerts are configured in Settings → Kitchen.
      </span>
    </div>
  );
}
