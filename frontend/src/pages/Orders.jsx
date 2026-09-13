import React from 'react';
import { PageHeader } from '../components/ui/Card';
import { Board, BoardCard, Column, InfoLine } from '../components/ui/Kanban';
import { AlertBanner } from '../components/ui/AlertBanner';
import { AIBadge, TypeBadge } from '../components/ui/Pill';
import { Button } from '../components/ui/Button';
import { FilterChips } from '../components/ui/Controls';
import { Drawer } from '../components/ui/Drawer';
import { useToast } from '../components/ui/Toast';
import { useOrders } from '../state/OrderContext';
import { api } from '../api/client';
import { normalizeTicket } from '../api/normalize';
import {
  incomingTickets as initIncoming,
  preparingTickets as initPreparing,
  readyTickets as initReady } from
'../data/sell';

const toLines = (items) =>
  (items || []).map((it) =>
    typeof it === 'string' ? it : `${it.qty > 1 ? `${it.qty}x ` : ''}${it.name}`
  );

const cardTag = (t) =>
  String(t?.tag || '').toLowerCase() === String(t?.type || 'dine-in').toLowerCase()
    ? undefined
    : t?.tag;

function Items({ ticket }) {
  return (
    <>
      {toLines(ticket.items).map((line) =>
      <InfoLine key={line}>{line}</InfoLine>
      )}
    </>);

}

export function Orders() {
  const toast = useToast();
  const [filter, setFilter] = React.useState('All orders');
  const [tickets, setTickets] = React.useState(null);
  const [heldIds, setHeldIds] = React.useState([]);
  const [detailTicket, setDetailTicket] = React.useState(null);
  const { incoming: liveIncoming, removeIncoming } = useOrders();

  const load = React.useCallback(async () => {
    try {
      const res = await api('/kds/tickets');
      const list = (res?.data || []);
      setTickets(list.length
        ? list.map(normalizeTicket)
        : [
            ...initIncoming.map((t) => ({ ...t, status: 'incoming', station: 'Kitchen' })),
            ...initPreparing.map((t) => ({ ...t, status: 'preparing', station: 'Kitchen' })),
            ...initReady.map((t) => ({ ...t, status: 'ready', station: 'Kitchen' }))
          ]);
    } catch {
      setTickets([
        ...initIncoming.map((t) => ({ ...t, status: 'incoming', station: 'Kitchen' })),
        ...initPreparing.map((t) => ({ ...t, status: 'preparing', station: 'Kitchen' })),
        ...initReady.map((t) => ({ ...t, status: 'ready', station: 'Kitchen' }))
      ]);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const setStatus = (t, status) => {
    setTickets((prev) => (prev || []).map((x) => (x.id === t.id ? { ...x, status } : x)));
    api(`/kds/tickets/${t.id}/bump`, { method: 'PUT', body: { status } }).catch(() => {});
  };

  const removeTicket = (t) => setTickets((prev) => (prev || []).filter((x) => x.id !== t.id));

  const startTicket = (t) => {
    if (liveIncoming.some((x) => x.id === t.id)) {
      removeIncoming(t.id);
    } else {
      setStatus(t, 'preparing');
    }
    toast.success(`Ticket ${t.id} started`);
  };

  const all = tickets || [];
  const matchesType = (t) =>
    filter === 'All orders' ||
    filter === 'Held' ||
    String(t.type || 'dine-in').toLowerCase() === filter.toLowerCase();

  const combinedIncoming = [...liveIncoming, ...all.filter((t) => t.status === 'incoming')];
  const preparing = all.filter((t) => t.status === 'preparing').filter(matchesType);
  const ready = all.filter((t) => t.status === 'ready').filter(matchesType);
  const heldTickets = combinedIncoming.filter((t) => matchesType(t) && heldIds.includes(t.id));
  const visibleIncoming = filter === 'Held'
    ? heldTickets
    : combinedIncoming.filter((t) => !heldIds.includes(t.id)).filter(matchesType);

  const typeLabel = (t) => {
    const ty = String(t?.type || 'dine-in').toLowerCase();
    if (ty === 'takeaway') return 'Takeaway';
    if (ty === 'delivery') return 'Delivery';
    return 'Dine-in';
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Orders" descriptor="Live kitchen board">
        <FilterChips
          ariaLabel="Order source"
          options={['All orders', 'Dine-in', 'Takeaway', 'Delivery', 'Held']}
          value={filter}
          onChange={setFilter} />

      </PageHeader>

      <Board>
        <Column title="Incoming" tone="blue" count={visibleIncoming.length}>
          {visibleIncoming.map((t) =>
          <BoardCard
            key={t.id}
            id={t.id}
            tag={cardTag(t)}
            tagTone={t.ai ? 'purple' : 'neutral'}
            right={t.elapsed}
            badge={
            <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={t.type} />
                {t.ai && <AIBadge label="AI phone order" />}
              </span>
            }
            banner={
            t.allergy ? <AlertBanner>{t.allergy}</AlertBanner> : undefined
            }
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => {
                    setHeldIds((h) => h.includes(t.id) ? h.filter((x) => x !== t.id) : [...h, t.id]);
                    toast(`Ticket ${t.id} ${heldIds.includes(t.id) ? 'unheld' : 'held'}`);
                  }}>
                    {heldIds.includes(t.id) ? 'Unhold' : 'Hold'}
                  </Button>
                  <Button size="sm" variant="red" onClick={() => startTicket(t)}>
                    Start
                  </Button>
                </>
            }>
            <div onClick={() => setDetailTicket(t)}>
              <Items ticket={t} />
            </div>
          </BoardCard>
          )}
        </Column>

        <Column title="Preparing" tone="amber" count={preparing.length}>
          {preparing.map((t) =>
          <BoardCard
            key={t.id}
            id={t.id}
            tag={cardTag(t)}
            right={t.elapsed}
            rightTone={t.fired ? 'red' : undefined}
            accent={t.fired ? 'red' : undefined}
            badge={<TypeBadge type={t.type} />}
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => {
                    setStatus(t, 'incoming');
                    toast(`Ticket ${t.id} moved to incoming`);
                  }}>
                    Undo
                  </Button>
                  <Button size="sm" variant="green" onClick={() => {
                    setStatus(t, 'ready');
                    toast.success(`Ticket ${t.id} marked ready`);
                  }}>
                    Mark ready
                  </Button>
                </>
            }>
            <div onClick={() => setDetailTicket(t)}>
              <Items ticket={t} />
            </div>
          </BoardCard>
          )}
        </Column>

        <Column title="Ready" tone="green" count={ready.length}>
          {ready.map((t) =>
          <BoardCard
            key={t.id}
            id={t.id}
            tag={cardTag(t)}
            tagTone={t.ai ? 'purple' : 'neutral'}
            right={t.elapsed}
            badge={
            <span className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={t.type} />
                {t.ai && <AIBadge label="AI phone order" />}
              </span>
            }
            footer={
            <>
                  <Button size="sm" variant="outline" onClick={() => {
                    setStatus(t, 'preparing');
                    toast(`Ticket ${t.id} moved to preparing`);
                  }}>
                    Undo
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => {
                    removeTicket(t);
                    toast(`Ticket ${t.id} bumped`, { undo: () => setTickets((prev) => [...(prev || []), t]) });
                  }}>
                    Bump
                  </Button>
                </>
            }>
            <div onClick={() => setDetailTicket(t)}>
              <Items ticket={t} />
            </div>
          </BoardCard>
          )}
        </Column>
      </Board>

      <Drawer
        open={!!detailTicket}
        onClose={() => setDetailTicket(null)}
        title={detailTicket ? detailTicket.id : ''}
        subtitle={detailTicket ? detailTicket.tag : ''}>
        {detailTicket && (
          <div className="space-y-3">
            {toLines(detailTicket.items).map((line) => (
              <InfoLine key={line}>{line}</InfoLine>
            ))}
            <div className="mt-2 border-t border-line pt-2">
              <InfoLine label="Order type:">{typeLabel(detailTicket)}</InfoLine>
            </div>
            {detailTicket.modifiers && detailTicket.modifiers.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta mb-1">Modifiers</p>
                {detailTicket.modifiers.map((m) => (
                  <InfoLine key={m}>{m}</InfoLine>
                ))}
              </div>
            )}
            {detailTicket.timestamps && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta mb-1">Timestamps</p>
                <InfoLine label="Placed:">{detailTicket.timestamps.placed}</InfoLine>
                <InfoLine label="Fired:">{detailTicket.timestamps.fired}</InfoLine>
                <InfoLine label="Served:">{detailTicket.timestamps.served}</InfoLine>
              </div>
            )}
            {detailTicket.payment !== undefined && (
              <div className="mt-2 border-t border-line pt-2">
                <InfoLine label="Payment:">{detailTicket.payment}</InfoLine>
                <InfoLine label="Server:">{detailTicket.server}</InfoLine>
                <InfoLine label="Table:">{detailTicket.table}</InfoLine>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>);

}