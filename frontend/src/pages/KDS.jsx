import { useState, useCallback, useEffect } from 'react';
import { FlameIcon, LinkIcon, PauseIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Board, BoardCard, Column, InfoLine } from '../components/ui/Kanban';
import { AlertBanner } from '../components/ui/AlertBanner';
import { AIBadge, TypeBadge } from '../components/ui/Pill';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useOrders } from '../state/OrderContext';
import { api } from '../api/client';
import { elapsedFrom, isOverSLA, normalizeTicket, shortId, SLA_MINUTES, useElapsedClock } from '../api/normalize';
import {
  incomingTickets as initIncomingTickets,
  preparingTickets as initPreparingTickets,
  readyTickets as initReadyTickets } from
'../data/sell';
import { stations } from '../data/pos';

const toLines = (items) =>
  (items || []).map((it) =>
    typeof it === 'string' ? it : `${it.qty > 1 ? `${it.qty}x ` : ''}${it.name}`
  );

const cardTag = (t) =>
  String(t?.tag || '').toLowerCase() === String(t?.type || 'dine-in').toLowerCase()
    ? undefined
    : t?.tag;

const ticketTitle = (t) => {
  const table = String(t?.table || '').trim();
  if (table && table !== '—') return `Table ${table}`;
  const type = String(t?.type || 'dine-in').toLowerCase();
  if (type === 'takeaway') return 'Takeaway';
  if (type === 'delivery') return 'Delivery';
  return shortId(t?.id);
};

/**
 * Late-ticket banner: shown once a ticket has been on the board
 * longer than the 15-minute SLA, alongside any allergy note.
 */
function TicketBanner({ ticket, onDismiss }) {
  const overdue = ticket.overSla && !ticket.alertDismissed;
  if (!ticket.allergy && !overdue) return undefined;
  const label = ticket.allergy
    ? overdue ? `${ticket.allergy} · over ${SLA_MINUTES} min` : ticket.allergy
    : `Over ${SLA_MINUTES} min — needs attention`;
  return (
    <AlertBanner
      action={overdue
        ? <button
            type="button"
            onClick={() => onDismiss(ticket)}
            className="rounded-full border border-status-red/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-status-red transition-colors duration-150 ease-soft hover:bg-status-red hover:text-white">
            Dismiss
          </button>
        : undefined}>
      {label}
    </AlertBanner>
  );
}

const timeLabel = (t) =>
  t.overSla && !t.alertDismissed
    ? <span className="font-bold text-status-red">{t.elapsed} · ALERT</span>
    : t.elapsed;

function StationTabs({
  value,
  onChange
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {stations.map((s) => {
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={s === value}
            className={`flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
            s === value ?
            'border-ink bg-ink text-white' :
            'border-line bg-surface text-meta hover:text-ink'}`
            }>
            
            {s}
          </button>);

      })}
    </div>);

}

function TicketBody({ ticket }) {
  return (
    <>
      {toLines(ticket.items).map((line) =>
      <InfoLine key={line}>{line}</InfoLine>
      )}
      {ticket.notes &&
      <InfoLine>
          <span className="italic text-status-amber">Note: {ticket.notes}</span>
        </InfoLine>
      }
    </>);

}

function fallbackTickets() {
  return [
    ...initIncomingTickets.map((t) => ({ ...t, status: 'incoming', station: t.station || 'Kitchen' })),
    ...initPreparingTickets.map((t) => ({ ...t, status: 'preparing', station: t.station || 'Kitchen' })),
    ...initReadyTickets.map((t) => ({ ...t, status: 'ready', station: t.station || 'Kitchen' }))
  ];
}

export function KDS() {
  const toast = useToast();
  const { incoming: liveIncoming, removeIncoming, restoreOrder } = useOrders();
  const [station, setStation] = useState('Kitchen');
  const [tickets, setTickets] = useState(null);
  const [dismissedIds, setDismissedIds] = useState([]);

  // Re-render every 30s so elapsed times (and 15-min late alerts) stay live.
  useElapsedClock();

  const load = useCallback(async () => {
    try {
      const res = await api('/kds/tickets');
      const list = (res?.data || []);
      setTickets(list.length ? list.map(normalizeTicket) : fallbackTickets());
    } catch {
      setTickets(fallbackTickets());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeTicket = useCallback((t) => {
    setTickets((prev) => (prev || []).filter((x) => x.id !== t.id));
  }, []);

  const dismissAlert = useCallback((t) => {
    setDismissedIds((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
    toast(`Late ticket ${t.id} acknowledged`);
  }, [toast]);

  const liveFired = liveIncoming.filter((t) => t.station === station);
  const all = tickets || [];
  const fired = all.filter((t) => t.station === station && t.status === 'incoming');
  const cooking = all.filter((t) => t.station === station && t.status === 'preparing');
  const pass = all.filter((t) => t.station === station && t.status === 'ready');
  // Recompute from created_at each tick so live tickets age and hit the 15-min alert.
  const withSla = (t) => {
    const elapsed = t.created_at ? elapsedFrom(t.created_at) : (t.elapsed || '0 min');
    return {
      ...t,
      elapsed,
      overSla: isOverSLA(elapsed),
      alertDismissed: dismissedIds.includes(t.id)
    };
  };
  const displayedFired = [...liveFired, ...fired].map(withSla);
  const displayedCooking = cooking.map(withSla);
  const displayedPass = pass.map(withSla);
  const lateCount = [...displayedFired, ...displayedCooking, ...displayedPass]
    .filter((t) => t.overSla && !t.alertDismissed).length;

  const fireTicket = useCallback((ticket) => {
    const isLive = liveIncoming.some((x) => x.id === ticket.id);
    toast(`Ticket ${ticket.id} started`, {
      undo: () => {
        setTickets((prev) => (prev || []).map((x) =>
          x.id === ticket.id ? { ...x, status: 'incoming', fired: false } : x
        ));
        if (isLive) restoreOrder(ticket);
      }
    });
    if (isLive) {
      removeIncoming(ticket.id);
      return;
    }
    setTickets((prev) => (prev || []).map((x) =>
      x.id === ticket.id ? { ...x, status: 'preparing', fired: true } : x
    ));
    api(`/kds/tickets/${ticket.id}/fire`, { method: 'PUT' }).catch(() => {});
    api(`/kds/tickets/${ticket.id}/bump`, { method: 'PUT', body: { status: 'preparing' } }).catch(() => {});
  }, [liveIncoming, removeIncoming, restoreOrder, toast]);

  const markReady = useCallback((ticket) => {
    setTickets((prev) => (prev || []).map((x) =>
      x.id === ticket.id ? { ...x, status: 'ready' } : x
    ));
    api(`/kds/tickets/${ticket.id}/bump`, { method: 'PUT', body: { status: 'ready' } }).catch(() => {});
    toast(`Ticket ${ticket.id} ready`, {
      undo: () => {
        setTickets((prev) => (prev || []).map((x) =>
          x.id === ticket.id ? { ...x, status: 'preparing' } : x
        ));
      }
    });
  }, [toast]);

  const recallTicket = useCallback((ticket) => {
    setTickets((prev) => (prev || []).map((x) =>
      x.id === ticket.id ? { ...x, status: 'preparing' } : x
    ));
    api(`/kds/tickets/${ticket.id}/bump`, { method: 'PUT', body: { status: 'preparing' } }).catch(() => {});
    toast(`Ticket ${ticket.id} recalled`);
  }, [toast]);

  const bumpTicket = useCallback((ticket) => {
    removeTicket(ticket);
    toast(`Ticket ${ticket.id} bumped`, {
      undo: () => {
        setTickets((prev) => [...(prev || []), ticket]);
      }
    });
  }, [removeTicket, toast]);

  const holdAll = useCallback(() => {
    const stationTickets = (tickets || []).filter((t) => t.station === station && t.status === 'incoming');
    if (stationTickets.length === 0) return;
    setTickets((prev) => (prev || []).filter((t) => !(t.station === station && t.status === 'incoming')));
    toast(`All ${station} tickets held`, {
      undo: () => {
        setTickets((prev) => [...(prev || []), ...stationTickets]);
      }
    });
  }, [tickets, station, toast]);

  const bumpAll = useCallback(() => {
    const stationTickets = pass.filter((t) => t.station === station);
    if (stationTickets.length === 0) return;
    setTickets((prev) => (prev || []).filter((t) => t.station !== station || t.status !== 'ready'));
    toast(`All ${station} tickets bumped`, {
      undo: () => {
        setTickets((prev) => [...(prev || []), ...stationTickets]);
      }
    });
  }, [pass, station, toast]);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Kitchen Display"
        descriptor={`${station} station · ${displayedFired.length + displayedCooking.length + displayedPass.length} live tickets${lateCount ? ` · ${lateCount} over ${SLA_MINUTES} min` : ''}`}>
        
        <StationTabs value={station} onChange={setStation} />
      </PageHeader>

      <Board>
        <Column
          title="Fired"
          tone="blue"
          count={displayedFired.length}
          action={
          <Button size="sm" variant="quiet" icon={<PauseIcon className="h-3.5 w-3.5" />} onClick={holdAll}>
              Hold all
            </Button>
          }>
          
          {displayedFired.map((t) =>
          <BoardCard
            key={t.id}
            id={ticketTitle(t)}
            tag={cardTag(t)}
            tagTone={t.ai ? 'purple' : 'neutral'}
            right={timeLabel(t)}
            rightTone={t.overSla && !t.alertDismissed ? 'red' : undefined}
            accent={t.overSla && !t.alertDismissed ? 'red' : undefined}
            badge={
            <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={t.type} />
                {t.ai && <AIBadge label="AI phone order" />}
                {t.linked &&
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-1 text-[11px] font-semibold text-meta">
                      <LinkIcon className="h-3 w-3" />
                      Split ticket
                    </span>
              }
              </span>
            }
            banner={<TicketBanner ticket={t} onDismiss={dismissAlert} />}
            footer={
            <>
                  <Button size="sm" variant="outline" icon={<FlameIcon className="h-3.5 w-3.5" />} onClick={() => fireTicket(t)}>
                    Fire
                  </Button>
                  <Button size="sm" variant="red" onClick={() => fireTicket(t)}>
                    Start
                  </Button>
                </>
            }>
            
              <TicketBody ticket={t} />
            </BoardCard>
          )}
        </Column>

        <Column title="Cooking" tone="amber" count={displayedCooking.length}>
          {displayedCooking.map((t) =>
          <BoardCard
            key={t.id}
            id={ticketTitle(t)}
            tag={cardTag(t)}
            right={timeLabel(t)}
            rightTone={(t.overSla && !t.alertDismissed) || t.fired ? 'red' : undefined}
            accent={(t.overSla && !t.alertDismissed) || t.fired ? 'red' : undefined}
            badge={
            <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={t.type} />
                {t.fired &&
            <span className="inline-flex items-center gap-1 rounded-full bg-tint-red px-2 py-1 text-[11px] font-bold uppercase text-status-red">
                    <FlameIcon className="h-3 w-3" />
                    Fired
                  </span>
            }
              </span>
            }
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => recallTicket(t)}>
                    Undo
                  </Button>
                  <Button size="sm" variant="green" onClick={() => markReady(t)}>
                    Mark ready
                  </Button>
                </>
            }>
            
              <TicketBody ticket={t} />
            </BoardCard>
          )}
        </Column>

        <Column
          title="Pass"
          tone="green"
          count={displayedPass.length}
          action={
          <Button size="sm" variant="dark" onClick={bumpAll}>
              Bump all
            </Button>
          }>
          
          {displayedPass.map((t) =>
          <BoardCard
            key={t.id}
            id={ticketTitle(t)}
            tag={cardTag(t)}
            tagTone={t.ai ? 'purple' : 'neutral'}
            right={timeLabel(t)}
            rightTone={t.overSla && !t.alertDismissed ? 'red' : undefined}
            accent={t.overSla && !t.alertDismissed ? 'red' : undefined}
            badge={
            <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={t.type} />
                {t.ai && <AIBadge label="AI phone order" />}
              </span>
            }
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => recallTicket(t)}>
                    Undo
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => bumpTicket(t)}>
                    Bump
                  </Button>
                </>
            }>
            
              <TicketBody ticket={t} />
            </BoardCard>
          )}
          {displayedPass.length === 0 &&
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-meta">
              Nothing at the pass for {station}.
            </p>
          }
        </Column>
      </Board>
    </div>);

}
