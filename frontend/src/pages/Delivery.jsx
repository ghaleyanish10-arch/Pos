import React, { useState } from 'react';
import { PrinterIcon, ChevronDownIcon, CheckIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Board, BoardCard, Column, InfoLine } from '../components/ui/Kanban';
import { AIBadge, Pill } from '../components/ui/Pill';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useOrders } from '../state/OrderContext';
import {
  deliveryIncoming,
  deliveryPreparing,
  deliveryReady } from
'../data/orm';

const platformTone = {
  Foodmandu: 'red',
  Pathao: 'green',
  Bhoj: 'amber',
  'Own store': 'blue'
};

const timelineStages = ['Accepted', 'Preparing', 'Courier assigned', 'Picked up', 'Delivered'];

const declineReasons = ['Out of stock', 'Too busy', 'Closing'];

function Body({ order }) {
  return (
    <>
      {order.items.map((i) =>
      <InfoLine key={i}>{i}</InfoLine>
      )}
      <InfoLine label="Courier:">{order.courier}</InfoLine>
    </>);

}

function Timeline({ stage }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-meta">
        Order progress
      </p>
      <div className="flex items-center gap-0">
        {timelineStages.map((s, idx) => {
          const isCurrent = s === stage;
          const isDone = idx < timelineStages.indexOf(stage);
          return (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    isDone
                      ? 'border-status-green bg-status-green text-white'
                      : isCurrent
                        ? 'border-status-blue bg-tint-blue text-status-blue'
                        : 'border-line bg-surface text-meta'
                  }`}>
                  {isDone ? <CheckIcon className="h-3 w-3" /> : idx + 1}
                </span>
                <span className={`text-[10px] font-semibold ${isCurrent ? 'text-ink' : 'text-meta'}`}>
                  {s}
                </span>
              </div>
              {idx < timelineStages.length - 1 && (
                <span
                  className={`mx-0.5 mb-4 h-0.5 flex-1 ${
                    isDone ? 'bg-status-green' : 'bg-line'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DeclineDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-ink/40">
        {value || 'Select reason'}
        <ChevronDownIcon className="h-3.5 w-3.5 text-meta" />
      </button>
      {open &&
        <div className="absolute bottom-full left-0 z-20 mb-1 w-48 rounded-xl border border-line bg-surface py-1 shadow-pop">
          {declineReasons.map((r) =>
            <button
              key={r}
              type="button"
              onClick={() => { onChange(r); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-canvas">
              {r}
            </button>
          )}
        </div>
      }
    </div>
  );
}

export function Delivery() {
  const toast = useToast();
  const { addTicket } = useOrders();
  const [orders, setOrders] = useState(() => ({
    incoming: deliveryIncoming.map((o) => ({ ...o, status: 'pending' })),
    preparing: deliveryPreparing.map((o) => ({ ...o, status: 'preparing' })),
    ready: deliveryReady.map((o) => ({ ...o, status: 'ready' }))
  }));

  const [expandedTimeline, setExpandedTimeline] = useState({});
  const [decliningId, setDecliningId] = useState(null);
  const [declineReason, setDeclineReason] = useState('');

  function handleAccept(orderId) {
    const order = orders.incoming.find((o) => o.id === orderId);
    setOrders((prev) => ({
      ...prev,
      incoming: prev.incoming.map((o) =>
        o.id === orderId ? { ...o, status: 'accepted', timelineStage: 'Accepted' } : o
      )
    }));
    if (order) {
      addTicket({
        id: order.id,
        type: 'delivery',
        tag: order.platform,
        items: order.items,
        elapsed: '0 min',
        station: 'Kitchen',
        payment: 'Online',
        server: order.platform,
        notes: order.courier,
        ai: order.ai
      });
    }
    setExpandedTimeline((prev) => ({ ...prev, [orderId]: true }));
    toast.success('Order accepted · sent to kitchen');
  }

  function handleAdvance(orderId) {
    setOrders((prev) => ({
      ...prev,
      incoming: prev.incoming.map((o) => {
        if (o.id !== orderId) return o;
        const currentIdx = timelineStages.indexOf(o.timelineStage || 'Accepted');
        const nextIdx = currentIdx + 1;
        if (nextIdx >= timelineStages.length) return o;
        return { ...o, timelineStage: timelineStages[nextIdx] };
      })
    }));
  }

  function handleDeclineConfirm(orderId) {
    if (!declineReason) return;
    setOrders((prev) => ({
      ...prev,
      incoming: prev.incoming.map((o) =>
        o.id === orderId ? { ...o, status: 'declined', declineReason } : o
      )
    }));
    setDecliningId(null);
    setDeclineReason('');
    toast.error(`Order declined — ${declineReason}`);
  }

  const incomingCount = orders.incoming.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.preparing.length + orders.incoming.filter((o) => o.status === 'accepted').length;
  const readyCount = orders.ready.length;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Delivery Orders"
        descriptor="4 channels aggregated · 7 live">

        <Pill tone="green" dot>
          All channels connected
        </Pill>
      </PageHeader>

      <Board>
        <Column title="Incoming" tone="blue" count={incomingCount}>
          {orders.incoming.map((o) => {
            const isDeclined = o.status === 'declined';
            const isAccepted = o.status === 'accepted';

            return (
              <BoardCard
                key={o.id}
                id={o.id}
                tag={isDeclined ? 'Declined' : isAccepted ? 'Accepted' : o.platform}
                tagTone={isDeclined ? 'red' : isAccepted ? 'green' : platformTone[o.platform]}
                right={o.elapsed}
                badge={o.ai ? <AIBadge label="AI phone order" /> : undefined}
                accent={isDeclined ? 'red' : isAccepted ? 'green' : undefined}
                footer={
                  o.status === 'pending' && (
                    decliningId === o.id ? (
                      <div className="flex w-full items-center gap-2">
                        <DeclineDropdown value={declineReason} onChange={setDeclineReason} />
                        <Button
                          size="sm"
                          variant="red"
                          disabled={!declineReason}
                          onClick={() => handleDeclineConfirm(o.id)}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="quiet" onClick={() => { setDecliningId(null); setDeclineReason(''); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setDecliningId(o.id)}>
                          Reject
                        </Button>
                        <Button size="sm" variant="red" onClick={() => handleAccept(o.id)}>
                          Accept & start
                        </Button>
                      </>
                    )
                  )
                }>

                <Body order={o} />

                {isAccepted && expandedTimeline[o.id] &&
                  <>
                    <Timeline stage={o.timelineStage || 'Accepted'} />
                    {o.timelineStage !== 'Delivered' &&
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleAdvance(o.id)}>
                          Advance
                        </Button>
                      </div>
                    }
                  </>
                }

                {isDeclined &&
                  <p className="mt-2 text-xs font-semibold text-status-red">
                    {o.declineReason}
                  </p>
                }
              </BoardCard>
            );
          })}
        </Column>

        <Column title="Preparing" tone="amber" count={preparingCount}>
          {orders.preparing.map((o) =>
          <BoardCard
            key={o.id}
            id={o.id}
            tag={o.platform}
            tagTone={platformTone[o.platform]}
            right={o.elapsed}
            footer={
            <>
                  <Button
                size="sm"
                variant="outline"
                icon={<PrinterIcon className="h-3.5 w-3.5" />}>

                    Packing slip
                  </Button>
                  <Button size="sm" variant="green">
                    Mark ready
                  </Button>
                </>
            }>

              <Body order={o} />
            </BoardCard>
          )}
        </Column>

        <Column title="Ready / handed off" tone="green" count={readyCount}>
          {orders.ready.map((o) =>
          <BoardCard
            key={o.id}
            id={o.id}
            tag={o.platform}
            tagTone={platformTone[o.platform]}
            right={o.elapsed}
            footer={
            <>
                  <Button size="sm" variant="outline">
                    Undo
                  </Button>
                  <Button size="sm" variant="dark">
                    Close order
                  </Button>
                </>
            }>

              <Body order={o} />
            </BoardCard>
          )}
        </Column>
      </Board>
    </div>);

}
