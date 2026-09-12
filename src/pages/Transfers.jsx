import { useState } from 'react';
import { ArrowRightIcon, TruckIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Board, BoardCard, Column, InfoLine } from '../components/ui/Kanban';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass, SearchInput, FilterChips } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import {
  transfersInTransit,
  transfersReceived,
  transfersRequested,
  branches,
  inventoryItems } from
'../data/ims';

function Route({ transfer }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-meta">
      <TruckIcon className="h-3.5 w-3.5" />
      {transfer.from}
      <ArrowRightIcon className="h-3.5 w-3.5" />
      <span className="font-semibold text-ink">{transfer.to}</span>
    </p>);
}

export function Transfers() {
  const toast = useToast();
  const [counting, setCounting] = useState(null);
  const [requested, setRequested] = useState(transfersRequested);
  const [inTransit, setInTransit] = useState(transfersInTransit);
  const [received, setReceived] = useState(transfersReceived);
  const [newOpen, setNewOpen] = useState(false);
  const [nextId, setNextId] = useState(223);
  const [newSource, setNewSource] = useState('Central Kitchen');
  const [newDest, setNewDest] = useState('Thamel House');
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newDate, setNewDate] = useState('2026-09-14');
  const [itemSearch, setItemSearch] = useState('');
  const [receiveDrawer, setReceiveDrawer] = useState(null);
  const [receiveLines, setReceiveLines] = useState([]);

  const filteredItems = inventoryItems.filter((item) =>
    item.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const handleSendTransfer = () => {
    if (!newItem || !newQty) {
      toast.error('Fill in item and quantity');
      return;
    }
    const id = `IBT-${nextId}`;
    const qtyStr = `${newQty} pcs`;
    setRequested((prev) => [...prev, { id, item: newItem, qty: qtyStr, from: newSource, to: newDest, age: 'Just now' }]);
    setNextId((n) => n + 1);
    setNewOpen(false);
    setNewItem('');
    setNewQty('');
    setNewDate('2026-09-14');
    toast.success('Transfer sent · In transit');
  };

  const openReceiveDrawer = (transfer) => {
    const expected = parseInt(transfer.qty.split(' ')[0], 10);
    setReceiveDrawer({ ...transfer, expected });
    setReceiveLines([{ item: transfer.item, expected, counted: expected, unit: transfer.qty.split(' ')[1] || 'pcs' }]);
  };

  const updateReceiveCounted = (index, value) => {
    setReceiveLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, counted: value } : l))
    );
  };

  const totalVariance = receiveLines.reduce((s, l) => s + (l.counted - l.expected), 0);

  const confirmReceipt = () => {
    setInTransit((prev) => prev.filter((t) => t.id !== receiveDrawer.id));
    const qtyStr = `${receiveLines[0].counted} ${receiveLines[0].unit}`;
    setReceived((prev) => [...prev, { ...receiveDrawer, qty: qtyStr, age: 'Just now' }]);
    setReceiveDrawer(null);
    setCounting(null);
    toast.success('Transfer received');
  };

  const dispatchTransfer = (id) => {
    const transfer = requested.find((t) => t.id === id);
    if (!transfer) return;
    setRequested((prev) => prev.filter((t) => t.id !== id));
    setInTransit((prev) => [...prev, { ...transfer, eta: '30 min', age: 'Just now' }]);
    toast.success('Transfer dispatched');
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Branch Transfers"
        descriptor={`Central kitchen allocation · ${inTransit.length + requested.length} active`}>

        <Button variant="dark" onClick={() => setNewOpen(true)}>New transfer</Button>
      </PageHeader>

      <Board>
        <Column title="Requested" tone="blue" count={requested.length}>
          {requested.map((t) =>
            <BoardCard
              key={t.id}
              id={t.id}
              tag={t.qty}
              right={t.age}
              footer={
                <>
                  <Button size="sm" variant="outline">
                    Decline
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => dispatchTransfer(t.id)}>
                    Dispatch
                  </Button>
                </>
              }>

              <InfoLine>{t.item}</InfoLine>
              <Route transfer={t} />
            </BoardCard>
          )}
        </Column>

        <Column title="In transit" tone="amber" count={inTransit.length}>
          {inTransit.map((t) =>
            <BoardCard
              key={t.id}
              id={t.id}
              tag={t.qty}
              right={t.age}
              badge={<Pill tone="amber">ETA {t.eta}</Pill>}
              footer={
                <>
                  <Button size="sm" variant="outline">
                    Track
                  </Button>
                  <Button
                    size="sm"
                    variant="green"
                    onClick={() => setCounting(counting === t.id ? null : t.id)}>

                    Receive
                  </Button>
                </>
              }>

              <InfoLine>{t.item}</InfoLine>
              <Route transfer={t} />
              {counting === t.id &&
                <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Counted on arrival
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="h-9 w-24 rounded-lg border border-line bg-surface px-3 font-mono text-sm focus:border-ink focus:outline-none"
                      defaultValue={t.qty.split(' ')[0]}
                      aria-label="Counted quantity" />

                    <span className="text-sm text-meta">of {t.qty} sent</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCounting(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="green" onClick={() => openReceiveDrawer(t)}>
                      Confirm receipt
                    </Button>
                  </div>
                </div>
              }
            </BoardCard>
          )}
        </Column>

        <Column title="Received" tone="green" count={received.length}>
          {received.map((t) =>
            <BoardCard
              key={t.id}
              id={t.id}
              tag={t.qty}
              right="Counted"
              rightTone="green"
              footer={
                <Button size="sm" variant="outline">
                  View discrepancy log
                </Button>
              }>

              <InfoLine>{t.item}</InfoLine>
              <Route transfer={t} />
            </BoardCard>
          )}
        </Column>
      </Board>

      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New transfer"
        subtitle="Move inventory between branches"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="dark" onClick={handleSendTransfer}>Send transfer</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Source branch">
            <FilterChips
              options={branches}
              value={newSource}
              onChange={setNewSource}
              ariaLabel="Source branch"
            />
          </Field>
          <Field label="Destination branch">
            <FilterChips
              options={branches}
              value={newDest}
              onChange={setNewDest}
              ariaLabel="Destination branch"
            />
          </Field>
          <Field label="Item">
            <SearchInput
              placeholder="Search inventory..."
              value={itemSearch}
              onChange={setItemSearch}
            />
            {itemSearch &&
              <div className="mt-1 rounded-xl border border-line bg-surface shadow-pop">
                {filteredItems.map((item) =>
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setNewItem(item); setItemSearch(''); }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-canvas"
                  >
                    {item}
                  </button>
                )}
                {filteredItems.length === 0 &&
                  <p className="px-3 py-2 text-sm text-meta">No items found</p>
                }
              </div>
            }
            {newItem && !itemSearch &&
              <div className="mt-2 flex items-center gap-2">
                <Pill>{newItem}</Pill>
                <button type="button" onClick={() => setNewItem('')} className="text-xs text-meta hover:text-ink">✕</button>
              </div>
            }
          </Field>
          <Field label="Quantity">
            <input
              className={inputClass}
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="e.g. 50"
            />
          </Field>
          <Field label="Expected arrival">
            <input
              className={inputClass}
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={!!receiveDrawer}
        onClose={() => { setReceiveDrawer(null); setCounting(null); }}
        title={`Receive ${receiveDrawer?.id ?? ''}`}
        subtitle={`${receiveDrawer?.from ?? ''} → ${receiveDrawer?.to ?? ''}`}
        footer={
          <div className="flex w-full items-center justify-between">
            <div>
              <span className="font-mono text-sm font-bold text-ink">
                Variance: {totalVariance >= 0 ? '+' : ''}{totalVariance}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setReceiveDrawer(null); setCounting(null); }}>Cancel</Button>
              <Button variant="green" onClick={confirmReceipt}>Confirm receipt</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {receiveLines.map((l, i) => {
            const variance = l.counted - l.expected;
            const hasVariance = variance !== 0;
            return (
              <div
                key={l.item}
                className={`rounded-xl border p-3 ${hasVariance ? 'border-status-red/30 bg-status-red/5' : 'border-line bg-canvas'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{l.item}</span>
                  {hasVariance &&
                    <Pill tone={variance > 0 ? 'green' : 'red'} dot>
                      {variance > 0 ? '+' : ''}{variance} {l.unit}
                    </Pill>
                  }
                </div>
                <p className="mt-1 text-xs text-meta">Expected: {l.expected} {l.unit}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Counted</span>
                  <button
                    type="button"
                    onClick={() => updateReceiveCounted(i, Math.max(0, l.counted - 1))}
                    className="h-8 w-8 rounded-lg border border-line bg-surface text-sm font-bold text-ink"
                  >
                    −
                  </button>
                  <span className="w-16 text-center font-mono text-sm font-bold">{l.counted}</span>
                  <button
                    type="button"
                    onClick={() => updateReceiveCounted(i, l.counted + 1)}
                    className="h-8 w-8 rounded-lg border border-line bg-surface text-sm font-bold text-ink"
                  >
                    +
                  </button>
                  <span className="text-xs text-meta"> {l.unit}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
            Variance summary
          </p>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-meta">Total expected</span>
            <span className="font-mono font-bold text-ink">{receiveLines.reduce((s, l) => s + l.expected, 0)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-meta">Total counted</span>
            <span className="font-mono font-bold text-ink">{receiveLines.reduce((s, l) => s + l.counted, 0)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm border-t border-line pt-1">
            <span className="text-meta">Variance</span>
            <span className={`font-mono font-bold ${totalVariance === 0 ? 'text-ink' : totalVariance > 0 ? 'text-status-green' : 'text-status-red'}`}>
              {totalVariance >= 0 ? '+' : ''}{totalVariance}
            </span>
          </div>
        </div>
      </Drawer>
    </div>);
}
