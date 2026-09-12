import { useState, useCallback } from 'react';
import { BarcodeIcon, CopyIcon, Edit2Icon, MinusIcon, PlusIcon, QrCodeIcon, SplitIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { useRole } from '../state/RoleContext';
import { floorRooms, floorTables, retailCart, tableBill } from '../data/pos';

const stateTone = {
  Open: 'green',
  Seated: 'amber',
  'Check dropped': 'blue',
  'Needs attention': 'red'
};

const stateFill = {
  Open: 'bg-tint-green border-status-green/25',
  Seated: 'bg-tint-amber border-status-amber/25',
  'Check dropped': 'bg-tint-blue border-status-blue/25',
  'Needs attention': 'bg-tint-red border-status-red/35'
};

const voidReasons = ['Comp', 'Mistake', 'Guest walked', 'Other'];

function ModeSwitch({
  mode,
  onChange
}) {
  return (
    <div className="inline-flex rounded-full border border-line bg-surface p-1">
      {['Hospitality', 'Retail'].map((m) =>
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        aria-pressed={m === mode}
        className={`h-8 rounded-full px-4 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
        m === mode ? 'bg-ink text-white' : 'text-meta hover:text-ink'}`
        }>
        
          {m}
        </button>
      )}
    </div>);

}

const qrFor = (table) => `${window.location.origin}/register?table=${encodeURIComponent(table.name)}`;

export function FrontOfHouse() {
  const toast = useToast();
  const { role } = useRole();
  const [mode, setMode] = useState('Hospitality');
  const [selected, setSelected] = useState(floorTables[4]);
  const [split, setSplit] = useState(0);
  const [heldOrders, setHeldOrders] = useState([]);
  const [filter, setFilter] = useState('All');

  const canRename = role === 'boss' || role === 'manager';
  const [tableNames, setTableNames] = useState({});
  const renameFor = (name) => tableNames[name] || name;
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const [qrTarget, setQrTarget] = useState(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payCovers, setPayCovers] = useState(1);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidManager, setVoidManager] = useState('');
  const [voidTarget, setVoidTarget] = useState(null);

  const billTotal = tableBill.reduce((s, l) => s + l.amount, 0);
  const cartTotal = retailCart.reduce((s, l) => s + l.qty * l.price, 0);

  const payKey = useCallback((k) => {
    setPayAmount((prev) => {
      if (k === '⌫') return prev.slice(0, -1);
      if (k === 'Clear') return '';
      if (prev.includes('.') && k === '.') return prev;
      if (k === '.' && prev === '') return '0.';
      return prev + k;
    });
  }, []);

  const confirmPayment = useCallback(() => {
    const amt = parseInt(payAmount.replace(/\D/g, ''), 10) || 0;
    if (amt <= 0) return;
    setPaymentOpen(false);
    setPayAmount('');
    setSplit(0);
    setPayCovers(1);
    toast.success(`Paid Rs ${amt.toLocaleString('en-IN')} · ${selected.name}`);
  }, [payAmount, selected.name, toast]);

  const holdOrder = useCallback(() => {
    setHeldOrders((h) => [...h, { ...selected, heldAt: Date.now() }]);
    toast(`Order held for ${selected.name}`);
  }, [selected, toast]);

  const resumeOrder = useCallback((order) => {
    setHeldOrders((h) => h.filter((o) => o.name !== order.name));
    toast.success(`Order resumed for ${order.name}`);
  }, [toast]);

  const openVoid = useCallback(() => {
    setVoidTarget(selected);
    setVoidReason('');
    setVoidManager('');
    setVoidOpen(true);
  }, [selected]);

  const confirmVoid = useCallback(() => {
    if (!voidReason || !voidManager.trim()) return;
    setVoidOpen(false);
    setVoidReason('');
    setVoidManager('');
    setVoidTarget(null);
    toast.error(`Check voided · ${selected.name}`);
  }, [voidReason, voidManager, selected.name, toast]);

  const activeTables = mode === 'Hospitality'
    ? (filter === 'Held' ? heldOrders : floorTables.filter((t) => heldOrders.every((h) => h.name !== t.name)))
    : [];

  const chipOptions = mode === 'Hospitality'
    ? (heldOrders.length > 0 ? ['All', 'Held'] : ['All'])
    : [];

  const roomGroups = floorRooms
    .map((room) => ({ room, tables: activeTables.filter((t) => t.room === room) }))
    .filter((g) => g.tables.length > 0);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Front of House"
        descriptor={mode === 'Hospitality' ? '12 tables · 5 seated' : 'Register 2 · Retail counter'}>
        
        <ModeSwitch mode={mode} onChange={setMode} />
      </PageHeader>

      {mode === 'Hospitality' ?
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {Object.keys(stateTone).map((s) =>
            <Pill key={s} tone={stateTone[s]} dot>
                  {s}
                </Pill>
            )}
              {heldOrders.length > 0 &&
              <Pill tone="amber" dot>
                  Held ({heldOrders.length})
                </Pill>
              }
            </div>

            {chipOptions.length > 1 &&
            <div className="mb-4 flex gap-2">
                {chipOptions.map((c) =>
                <button
                  key={c}
                  type="button"
                  aria-pressed={filter === c}
                  onClick={() => setFilter(c)}
                  className={`h-8 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                  filter === c ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'}`}
                >
                  {c}
                </button>
                )}
              </div>
            }

            {roomGroups.map((group) =>
            <div key={group.room} className="mb-6 last:mb-0">
              <div className="mb-2.5 flex items-center gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink">{group.room}</h3>
                <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-meta">
                  {group.tables.length} {group.tables.length === 1 ? 'table' : 'tables'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {group.tables.map((t) =>
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelected(t)}
                  aria-pressed={selected.name === t.name}
                  className={`group rounded-xl border p-4 text-left transition-colors duration-150 ease-soft hover:border-ink/40 ${stateFill[t.state]} ${
                  selected.name === t.name ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`
                  }>
                  
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-extrabold text-ink">{renameFor(t.name)}</span>
                      <div className="flex items-center gap-1">
                        {canRename &&
                        <button
                          type="button"
                          aria-label={`Rename ${t.name}`}
                          onClick={(e) => { e.stopPropagation(); setRenameTarget(t); setRenameVal(tableNames[t.name] || t.name); }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-meta opacity-0 transition-opacity hover:bg-surface hover:text-ink group-hover:opacity-100 focus:opacity-100">
                          <Edit2Icon className="h-3 w-3" />
                        </button>
                        }
                        <button
                          type="button"
                          aria-label={`QR code for ${t.name}`}
                          onClick={(e) => { e.stopPropagation(); setQrTarget(t); }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-meta hover:bg-surface hover:text-ink">
                          <QrCodeIcon className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-xs text-meta">{t.seats}p</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-ink/70">{t.state}</p>
                    <p className="text-xs text-meta">{t.detail}</p>
                  </button>
                )}
              </div>
            </div>
          )}
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-ink">{renameFor(selected.name)}</h2>
                <p className="text-sm text-meta">{selected.detail}</p>
              </div>
              <Pill tone={stateTone[selected.state]} dot>
                {selected.state}
              </Pill>
            </div>

            {selected.state === 'Needs attention' &&
          <div className="mt-4">
                <AlertBanner>Allergy note open · peanuts — confirm with kitchen</AlertBanner>
              </div>
          }

            <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              {tableBill.map((l) =>
            <li key={l.item} className="flex justify-between">
                  <span>{l.item}</span>
                  <span className="font-mono font-semibold">
                    Rs {l.amount.toLocaleString('en-IN')}
                  </span>
                </li>
          )}
              <li className="flex justify-between border-t border-line pt-3 text-base">
                <span className="font-bold">Total</span>
                <span className="font-mono font-extrabold">
                  Rs {billTotal.toLocaleString('en-IN')}
                </span>
              </li>
            </ul>

            <div className="mt-5 rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <SplitIcon className="h-4 w-4" />
                  Split bill
                </span>
                <div className="flex items-center gap-2">
                  <button
                  type="button"
                  aria-label="Fewer shares"
                  onClick={() => setSplit((s) => Math.max(0, s - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface">
                  
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono text-sm font-bold">{split}</span>
                  <button
                  type="button"
                  aria-label="More shares"
                  onClick={() => setSplit((s) => Math.min(6, s + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface">
                  
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {split > 0 &&
            <ul className="mt-3 space-y-1.5">
                  {Array.from({ length: split }).map((_, i) =>
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                
                      <span className="text-meta">Cover {i + 1}</span>
                      <span className="font-mono font-semibold">
                        Rs {Math.round(billTotal / split).toLocaleString('en-IN')}
                      </span>
                    </li>
              )}
                </ul>
          }
            </div>

            <div className="mt-5 flex gap-2">
              {heldOrders.some((h) => h.name === selected.name) ?
              <Button variant="green" full onClick={() => resumeOrder(selected)}>
                  Resume order
                </Button> :
              <>
                <Button variant="outline" onClick={holdOrder}>Hold</Button>
                <Button variant="red" onClick={openVoid}>Void</Button>
                <Button variant="dark" full onClick={() => {
                  setPayAmount(String(billTotal));
                  setPaymentOpen(true);
                }}>
                  Take payment
                </Button>
              </>
              }
            </div>
          </Card>
        </div> :

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <label className="relative block">
              <BarcodeIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-meta" />
              <input
              autoFocus
              placeholder="Scan barcode or type SKU"
              aria-label="Scan barcode"
              className="h-14 w-full rounded-xl border-2 border-ink bg-canvas pl-12 pr-4 font-mono text-base text-ink placeholder:text-meta focus:outline-none" />
            
            </label>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Manual SKU entry
            </p>
            <div className="mt-3 grid max-w-[320px] grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', '⌫'].map((k) =>
            <button
              key={k}
              type="button"
              className="h-14 rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface">
              
                  {k}
                </button>
          )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Cart</h2>
              <span className="font-mono text-xs text-meta">{retailCart.length} lines</span>
            </div>
            <ul className="mt-4 space-y-3 border-t border-line pt-4">
              {retailCart.map((l) =>
            <li key={l.sku} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{l.name}</p>
                    <p className="font-mono text-xs text-meta">
                      {l.sku} · {l.qty} × Rs {l.price}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold">
                    Rs {(l.qty * l.price).toLocaleString('en-IN')}
                  </span>
                </li>
          )}
            </ul>
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-base">
              <span className="font-bold">Total</span>
              <span className="font-mono font-extrabold">
                Rs {cartTotal.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" onClick={openVoid}>Void</Button>
              <Button variant="dark" full onClick={() => {
                setPayAmount(String(cartTotal));
                setPaymentOpen(true);
              }}>
                Checkout
              </Button>
            </div>
          </Card>
        </div>
      }

      <Dialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Collect payment"
        subtitle={`${selected.name} · Rs ${billTotal.toLocaleString('en-IN')} due`}
        width="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button variant="dark" full onClick={confirmPayment}>
              Pay Rs {parseInt(payAmount.replace(/\D/g, ''), 10).toLocaleString('en-IN') || '0'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-canvas p-4 text-center">
            <span className="font-mono text-3xl font-extrabold text-ink">
              Rs {parseInt(payAmount.replace(/\D/g, ''), 10).toLocaleString('en-IN') || '0'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','Clear','0','⌫'].map((k) =>
              <button
                key={k}
                type="button"
                onClick={() => payKey(k)}
                className="h-12 rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface"
              >
                {k}
              </button>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Payment method
            </p>
            <div className="flex gap-2">
              {['Cash','Card','QR','Split'].map((m) =>
                <button
                  key={m}
                  type="button"
                  aria-pressed={payMethod === m}
                  onClick={() => setPayMethod(m)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ease-soft ${
                    payMethod === m
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:text-ink'
                  }`}
                >
                  {m}
                </button>
              )}
            </div>
          </div>

          {payMethod === 'Split' &&
          <div className="rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Covers</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPayCovers((c) => Math.max(1, c - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono text-sm font-bold">{payCovers}</span>
                  <button
                    type="button"
                    onClick={() => setPayCovers((c) => Math.min(12, c + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {Array.from({ length: payCovers }).map((_, i) =>
                  <li key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                    <span className="text-meta">Guest {i + 1}</span>
                    <span className="font-mono font-semibold">
                      Rs {Math.round(billTotal / payCovers).toLocaleString('en-IN')}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          }
        </div>
      </Dialog>

      <Drawer
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void check"
        subtitle={voidTarget ? voidTarget.name : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="red"
              full
              disabled={!voidReason || !voidManager.trim()}
              onClick={confirmVoid}
            >
              Confirm void
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Reason code
            </p>
            <div className="flex flex-wrap gap-2">
              {voidReasons.map((r) =>
                <button
                  key={r}
                  type="button"
                  aria-pressed={voidReason === r}
                  onClick={() => setVoidReason(r)}
                  className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                    voidReason === r
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:text-ink'
                  }`}
                >
                  {r}
                </button>
              )}
            </div>
          </div>

          <Field label="Manager approval (PIN or name)">
            <input
              type="text"
              value={voidManager}
              onChange={(e) => setVoidManager(e.target.value)}
              placeholder="Enter manager PIN or name"
              className={inputClass}
            />
          </Field>
        </div>
      </Drawer>

      <Dialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title={`Rename ${renameTarget?.name || ''}`}
        subtitle="This changes how the table is shown across the app."
        footer={
          <>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              variant="dark"
              disabled={!renameVal.trim() || renameVal.trim() === renameTarget?.name}
              onClick={() => {
                setTableNames((prev) => {
                  const next = { ...prev };
                  if (renameVal.trim() === renameTarget.name) {
                    delete next[renameTarget.name];
                  } else {
                    next[renameTarget.name] = renameVal.trim();
                  }
                  return next;
                });
                toast('Table renamed', { tone: 'green' });
                setRenameTarget(null);
              }}>
              Save name
            </Button>
          </>
        }>
        <Field label="Table display name">
          <input
            className={inputClass}
            placeholder={renameTarget?.name || ''}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-meta">
          Original name <span className="font-mono font-semibold">{renameTarget?.name}</span> is preserved internally for the order flow.
        </p>
      </Dialog>

      <Dialog
        open={!!qrTarget}
        onClose={() => setQrTarget(null)}
        title={`QR code · ${qrTarget ? renameFor(qrTarget.name) : ''}`}
        subtitle={qrTarget ? `Scan with any phone camera — opens the register menu for this table` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setQrTarget(null)}>Close</Button>
            <Button
              variant="dark"
              onClick={() => {
                navigator.clipboard?.writeText(qrFor(qrTarget));
                toast('Order link copied', { tone: 'green' });
              }}>
              <CopyIcon className="h-4 w-4 mr-2" /> Copy link
            </Button>
          </>
        }>
        <div className="flex flex-col items-center gap-5 py-2">
          {qrTarget &&
          <div className="rounded-2xl border border-line bg-white p-4 shadow-pop">
              <QRCodeSVG
                value={qrFor(qrTarget)}
                size={200}
                level="M"
                marginSize={2}
                bgColor="#FFFFFF"
                fgColor="#1C1B19" />
            </div>
          }
          <div className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3.5 py-1.5">
            <QrCodeIcon className="h-3.5 w-3.5 text-status-blue" />
            <span className="text-xs font-semibold text-ink">
              {qrTarget ? renameFor(qrTarget.name) : ''} · table ordering
            </span>
          </div>
          <p className="max-w-[320px] text-center text-xs text-meta">
            Guests scan this code to open the register menu and place this table's order directly from
            their phone — no app download required.
          </p>
        </div>
      </Dialog>
    </div>);

}
