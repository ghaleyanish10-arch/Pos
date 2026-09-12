import React, { useState } from 'react';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { StatCard } from '../components/ui/StatCard';
import { MobileFrame } from '../components/ui/MobileFrame';
import { Dialog } from '../components/ui/Dialog';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import { menuItems } from '../data/manage';
import { onlineOrders as initialOrders } from '../data/business';
import { useSettings } from '../state/SettingsContext';

const tabs = ['Theme', 'Delivery zones', 'Payment methods', 'Order sync'];

const steps = ['Received', 'Preparing', 'Ready', 'Completed'];
const deliverySteps = ['Received', 'Preparing', 'Ready', 'Out for delivery', 'Completed'];

const statusTone = {
  Received: 'blue',
  Preparing: 'amber',
  Ready: 'green',
  'Out for delivery': 'blue',
  Completed: 'green',
  Accepted: 'green',
  Rejected: 'red'
};

const accentOptions = ['#1C1B19', '#D0342C', '#15803D', '#2563EB'];

const allergenNotes = {
  'Chicken Momo': 'Contains wheat · chicken · soya',
  'Momo Jhol': 'Contains wheat · chicken · sesame',
  'Veg Momo': 'Contains wheat · dairy',
  'Thakali Set': 'Contains rice · dairy · lentil',
  'Dal Bhat': 'Contains rice · lentil',
  'Buff Sekuwa': 'Contains beef · chilli',
  'Chicken Chilli': 'Contains chicken · soya',
  'Mint Mojito': 'Contains mint · sugar',
  'Cheesecake': 'Contains wheat · dairy · egg',
  'Tiramisu': 'Contains wheat · dairy · egg · coffee'
};

export function OnlineStore() {
  const [tab, setTab] = useState('Theme');
  const [open, setOpen] = useState(true);
  const [orders, setOrders] = useState(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [accent, setAccent] = useState(accentOptions[0]);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showAllergens, setShowAllergens] = useState(false);
  const { settings } = useSettings();
  const toast = useToast();

  const currentSteps = selectedOrder?.type === 'delivery' ? deliverySteps : steps;
  const currentStepIndex = selectedOrder ? currentSteps.indexOf(selectedOrder.status) : 0;

  const handleAccept = () => {
    if (!selectedOrder) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id ? { ...o, status: 'Accepted' } : o
      )
    );
    setSelectedOrder((o) => o ? { ...o, status: 'Accepted' } : null);
    toast(`${selectedOrder.id} accepted`, { tone: 'green' });
  };

  const handleReject = () => {
    if (!selectedOrder) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id ? { ...o, status: 'Rejected' } : o
      )
    );
    setSelectedOrder((o) => o ? { ...o, status: 'Rejected' } : null);
    toast(`${selectedOrder.id} rejected`, { tone: 'red' });
  };

  const handleAdvanceStep = () => {
    if (!selectedOrder) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= currentSteps.length) return;
    const nextStatus = currentSteps[nextIndex];
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id ? { ...o, status: nextStatus } : o
      )
    );
    setSelectedOrder((o) => o ? { ...o, status: nextStatus } : null);
    toast(`${selectedOrder.id} → ${nextStatus}`, { tone: 'green' });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Online Store" descriptor="thamelhouse.order.np" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Online orders today" value="38" meta="Rs 42,180" />
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Storefront
            </p>
            <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">
              {open ? 'Open' : 'Closed'}
            </p>
          </div>
          <Toggle checked={open} onChange={setOpen} label="Storefront open" />
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
            Menu sync
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-status-green">
            <CheckIcon className="h-4 w-4" />
            In sync with POS
          </p>
          <p className="mt-0.5 text-xs text-meta">Last pushed 6 min ago</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((t) =>
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={t === tab}
              className={`h-9 rounded-full border px-4 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
              t === tab ?
              'border-ink bg-ink text-white' :
              'border-line bg-surface text-meta hover:text-ink'}`
              }>
              
                {t}
              </button>
            )}
          </div>

          <Card>
            {tab === 'Theme' &&
            <div className="space-y-5">
                <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
                  Theme
                </h2>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                      Accent colour
                    </p>
                    <p className="font-mono text-xs font-bold text-ink">{accent}</p>
                  </div>
                  <div className="flex gap-2">
                    {accentOptions.map((c) =>
                  <button
                    key={c}
                    type="button"
                    aria-label={`Accent ${c}`}
                    aria-pressed={c === accent}
                    onClick={() => setAccent(c)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-150 ease-soft hover:scale-105 ${
                    c === accent ? 'border-ink ring-2 ring-offset-2 ring-ink' : 'border-transparent'}`
                    }
                    style={{ backgroundColor: c }}>
                    {c === accent &&
                  <CheckIcon className="h-4 w-4 text-white" />
                    }
                  </button>

                  )}
                  </div>
                  <p className="mt-2 text-xs text-meta">
                    Applies to the live storefront — buttons, cart bar and highlight accents.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="text-sm font-semibold">Show item photos</span>
                  <Toggle checked={showPhotos} onChange={setShowPhotos} label="Show item photos" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="text-sm font-semibold">Display allergen notes</span>
                  <Toggle checked={showAllergens} onChange={setShowAllergens} label="Display allergen notes" />
                </div>
              </div>
            }

            {tab === 'Delivery zones' &&
            <div className="space-y-3">
                <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
                  Delivery zones
                </h2>
                {[
              { area: 'Thamel · 0–2 km', fee: 'Rs 60', eta: '20 min' },
              { area: 'Lazimpat · 2–4 km', fee: 'Rs 110', eta: '32 min' },
              { area: 'Baluwatar · 4–6 km', fee: 'Rs 180', eta: '45 min' }].
              map((z) =>
              <div
                key={z.area}
                className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                
                    <div>
                      <p className="text-sm font-semibold text-ink">{z.area}</p>
                      <p className="text-xs text-meta">
                        {z.fee} delivery · {z.eta} average
                      </p>
                    </div>
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  </div>
              )}
              </div>
            }

            {tab === 'Payment methods' &&
            <div className="space-y-3">
                <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
                  Payment methods
                </h2>
                {['eSewa', 'Khalti', 'Fonepay QR', 'Card on delivery', 'Cash on delivery'].map(
                (m, i) =>
                <div
                  key={m}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  
                      <span className="text-sm font-semibold text-ink">{m}</span>
                      <Toggle checked={i !== 3} onChange={() => undefined} label={m} />
                    </div>

              )}
              </div>
            }

            {tab === 'Order sync' &&
            <div className="space-y-4">
                <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
                  Order sync
                </h2>
                <p className="text-sm text-meta">
                  Online orders drop straight into the kitchen board as Incoming tickets and
                  deduct stock through the same recipe rules as dine-in.
                </p>
                <div className="rounded-xl border border-line bg-canvas p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Auto-accept orders</span>
                    <Toggle checked onChange={() => undefined} label="Auto-accept orders" />
                  </div>
                  <p className="mt-1 text-xs text-meta">
                    Orders over Rs 5,000 still require manual acceptance.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="text-sm font-semibold">86'd items hidden online</span>
                  <Pill tone="green" dot>
                    Active
                  </Pill>
                </div>

                <div className="border-t border-line pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Recent orders
                  </h3>
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Order</Th>
                          <Th>Customer</Th>
                          <Th className="text-right">Total</Th>
                          <Th>Status</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <Tr key={o.id}>
                            <Td className="font-mono text-sm font-semibold">{o.id}</Td>
                            <Td className="text-sm">{o.customer}</Td>
                            <Td className="text-right font-mono text-sm font-bold">{o.total}</Td>
                            <Td>
                              <Pill tone={statusTone[o.status] || 'neutral'} dot>
                                {o.status}
                              </Pill>
                            </Td>
                            <Td className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedOrder(o)}>
                                Open
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                </div>
              </div>
            }
          </Card>
        </div>

        <MobileFrame label="Live storefront preview">
          <div className="pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-extrabold text-ink">{settings.businessName}</p>
                <p className="text-xs text-meta">{settings.city} · 20 min delivery</p>
              </div>
              <Pill tone={open ? 'green' : 'red'} dot>
                {open ? 'Open' : 'Closed'}
              </Pill>
            </div>
            <div className="mt-3 space-y-2.5">
              {menuItems.slice(0, 6).map((item) => {
                const initials = item.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
                    
                  {showPhotos ? (
                      <img
                        src={item.photo}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-bold text-meta ring-1 ring-line">
                        {initials}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                      <p className="font-mono text-xs text-meta">{item.price}</p>
                      {showAllergens && allergenNotes[item.name] && (
                        <p className="mt-0.5 text-[10px] font-medium text-status-amber">
                          {allergenNotes[item.name]}
                        </p>
                      )}
                    </div>
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white transition-colors duration-150 ease-soft"
                      style={{ backgroundColor: accent }}>
                      +
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              className="sticky bottom-0 mt-4 rounded-xl px-4 py-3 text-center text-sm font-bold text-white transition-colors duration-150 ease-soft"
              style={{ backgroundColor: accent }}>
              View cart · Rs 1,130
            </div>
          </div>
        </MobileFrame>
      </div>

      <Dialog
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.id || 'Order'}
        subtitle={selectedOrder ? `${selectedOrder.customer} · ${selectedOrder.time}` : ''}
        width="max-w-md"
        footer={
          selectedOrder && !['Accepted', 'Rejected', 'Completed'].includes(selectedOrder.status) ? (
            <>
              <Button variant="red" onClick={handleReject}>
                Reject
              </Button>
              <Button variant="green" onClick={handleAccept}>
                Accept
              </Button>
            </>
          ) : null
        }>
        {selectedOrder && (
          <div className="scroll-thin max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Items
              </p>
              <div className="mt-2 space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.name}</p>
                      <p className="text-xs text-meta">Qty {item.qty}</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-ink">
                      Rs {item.price.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-line pt-3">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="font-mono text-sm font-extrabold text-ink">{selectedOrder.total}</span>
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                {selectedOrder.type === 'delivery' ? 'Delivery address' : 'Pickup'}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedOrder.address}</p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Status
              </p>
              <div className="mt-3">
                <Pill tone={statusTone[selectedOrder.status] || 'neutral'} dot>
                  {selectedOrder.status}
                </Pill>
              </div>
              {!['Accepted', 'Rejected', 'Completed'].includes(selectedOrder.status) && (
                <div className="mt-4">
                  <div className="flex items-center gap-1">
                    {currentSteps.map((s, i) => (
                      <React.Fragment key={s}>
                        <div className={`flex h-7 items-center justify-center rounded-full px-3 text-xs font-semibold ${
                          i <= currentStepIndex
                            ? 'bg-ink text-white'
                            : 'bg-canvas text-meta'
                        }`}>
                          {s}
                        </div>
                        {i < currentSteps.length - 1 && (
                          <ChevronRightIcon className="h-3 w-3 text-meta" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  {currentStepIndex < currentSteps.length - 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={handleAdvanceStep}>
                      Mark as {currentSteps[currentStepIndex + 1]}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>);

}
