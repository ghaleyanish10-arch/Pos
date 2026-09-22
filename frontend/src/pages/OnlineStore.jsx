import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, ChevronRightIcon, ExternalLinkIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { StatCard } from '../components/ui/StatCard';
import { MobileFrame } from '../components/ui/MobileFrame';
import { Dialog } from '../components/ui/Dialog';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { CustomerStore } from '../components/CustomerStore';
import { useToast } from '../components/ui/Toast';
import { onlineOrders as initialOrders } from '../data/business';
import { useOrders } from '../state/OrderContext';
import { useCampaigns, DEMO_CAMPAIGN } from '../state/CampaignContext';
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

const newOrderId = () => `ORD-${9000 + Math.floor(Math.random() * 900)}`;

export function OnlineStore() {
  const [tab, setTab] = useState('Theme');
  const [orders, setOrders] = useState(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [payMethods, setPayMethods] = useState(() => ['eSewa', 'Khalti', 'Fonepay QR', 'Card on delivery', 'Cash on delivery']);
  const [autoAccept, setAutoAccept] = useState(true);
  const { storefront, setStorefront } = useSettings();
  const { addTicket } = useOrders();
  const { campaignList } = useCampaigns();
  const liveCampaign = campaignList.find((c) => c.status === 'Scheduled') || DEMO_CAMPAIGN;
  const toast = useToast();

  const open = storefront.open;
  const setOpen = (v) => setStorefront({ open: v });
  const accent = storefront.accent;
  const setAccent = (c) => setStorefront({ accent: c });
  const showPhotos = storefront.showPhotos;
  const setShowPhotos = (v) => setStorefront({ showPhotos: v });
  const showAllergens = storefront.showAllergens;
  const setShowAllergens = (v) => setStorefront({ showAllergens: v });

  const currentSteps = selectedOrder?.type === 'delivery' ? deliverySteps : steps;
  const currentStepIndex = selectedOrder ? currentSteps.indexOf(selectedOrder.status) : 0;

  // A customer order placed in the live preview (or the customer register)
  // lands here exactly like a storefront order — visible in Order sync.
  const handleCustomerOrder = (lines, subtotal) => {
    const id = newOrderId();
    const items = lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price }));
    setOrders((prev) => [
      {
        id,
        customer: 'Customer register',
        items,
        address: 'Pickup at counter',
        type: 'pickup',
        total: `Rs ${subtotal.toLocaleString('en-IN')}`,
        status: 'Received',
        time: 'Just now'
      },
      ...prev
    ]);
    toast(`${id} received · open Order sync to accept`, { tone: 'green' });
  };

  const handleAccept = () => {
    if (!selectedOrder) return;
    const isDelivery = selectedOrder.type === 'delivery';
    setOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id ? { ...o, status: 'Accepted' } : o
      )
    );
    setSelectedOrder((o) => o ? { ...o, status: 'Accepted' } : null);
    addTicket({
      id: selectedOrder.id,
      type: isDelivery ? 'delivery' : 'takeaway',
      tag: isDelivery ? 'Own store' : 'Pickup',
      items: (selectedOrder.items || []).map((i) => `${i.qty}× ${i.name}`),
      elapsed: '0 min',
      station: 'Kitchen',
      payment: 'Online',
      server: 'Online store',
      notes: selectedOrder.address || ''
    });
    toast(`${selectedOrder.id} accepted · sent to kitchen`, { tone: 'green' });
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
      <PageHeader
        title="Online Store"
        descriptor={
          <a
            href="/register/customer?device=desktop"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the customer register storefront (desktop) in a new tab"
            className="font-medium text-meta underline underline-offset-4 transition-colors duration-150 ease-soft hover:text-ink">
            thamelhouse.order.np
          </a>
        } />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Online orders today" value="38" meta="Rs 42,180" />
        <StatCard
          label="Storefront"
          value={open ? 'Open' : 'Closed'}
          icon={<Toggle checked={open} onChange={setOpen} label="Storefront open" />} />
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-caption font-semibold text-meta">
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
        <div className="order-2 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((t) =>
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={t === tab}
              className={`h-9 rounded-full border px-4 text-13 font-semibold transition-colors duration-150 ease-soft ${
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
                <h2 className="text-base font-bold tracking-tight text-ink">
                  Theme
                </h2>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-caption font-semibold text-meta">
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
                <h2 className="text-base font-bold tracking-tight text-ink">
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
                    <Pill tone="neutral">{z.fee}</Pill>
                  </div>
              )}
              </div>
            }

            {tab === 'Payment methods' &&
            <div className="space-y-3">
                <h2 className="text-base font-bold tracking-tight text-ink">
                  Payment methods
                </h2>
                {['eSewa', 'Khalti', 'Fonepay QR', 'Card on delivery', 'Cash on delivery'].map(
                (m) =>
                <div
                  key={m}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                  
                      <span className="text-sm font-semibold text-ink">{m}</span>
                      <Toggle
                        checked={payMethods.includes(m)}
                        onChange={() =>
                          setPayMethods((prev) =>
                            prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
                          )
                        }
                        label={m} />
                    </div>

              )}
              </div>
            }

            {tab === 'Order sync' &&
            <div className="space-y-4">
                <h2 className="text-base font-bold tracking-tight text-ink">
                  Order sync
                </h2>
                <p className="text-sm text-meta">
                  Online orders drop straight into the kitchen board as Incoming tickets and
                  deduct stock through the same recipe rules as dine-in.
                </p>
                <div className="rounded-xl border border-line bg-canvas p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Auto-accept orders</span>
                    <Toggle checked={autoAccept} onChange={setAutoAccept} label="Auto-accept orders" />
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
                  <h3 className="text-caption font-semibold text-meta">
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

        <div className="order-1 lg:order-2">
          <MobileFrame label="Live customer view · try it" height={640}>
            <CustomerStore
              accent={accent}
              storefrontOpen={open}
              showPhotos={showPhotos}
              showAllergens={showAllergens}
              onOrderPlaced={handleCustomerOrder}
              campaign={liveCampaign}
              containDialogs />
          </MobileFrame>

          <div className="mt-4 rounded-card border border-line bg-surface p-4">
            <p className="text-caption font-semibold text-meta">
              Customer register
            </p>
            <p className="mt-1 text-xs text-meta">
              The ordering view customers use — same menu, cart and checkout, from their point of view.
            </p>
            <Link
              to="/register/customer"
              className="btn btn-primary btn-lg mt-3 w-full">
              <ExternalLinkIcon className="h-4 w-4" />
              Open customer register
            </Link>
            <div className="mt-2 flex gap-1 rounded-full border border-line bg-canvas p-1">
              {[
                { key: 'desktop', label: 'Desktop', Icon: MonitorIcon },
                { key: 'tablet', label: 'Tablet', Icon: TabletIcon },
                { key: 'phone', label: 'Phone', Icon: SmartphoneIcon }
              ].map(({ key, label, Icon }) => (
                <Link
                  key={key}
                  to={`/register/customer?device=${key}`}
                  aria-pressed={key === 'phone'}
                  className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors duration-150 ease-soft ${
                    key === 'phone' ? 'bg-ink text-white' : 'text-meta hover:text-ink'
                  }`}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
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
              <p className="text-caption font-semibold text-meta">
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
              <p className="text-caption font-semibold text-meta">
                {selectedOrder.type === 'delivery' ? 'Delivery address' : 'Pickup'}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedOrder.address}</p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-caption font-semibold text-meta">
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
