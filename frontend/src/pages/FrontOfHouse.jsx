import { useState, useCallback, useEffect } from 'react';
import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CombineIcon,
  CopyIcon,
  Edit2Icon,
  EyeIcon,
  MinusIcon,
  MoveIcon,
  PlusIcon,
  QrCodeIcon,
  ReceiptIcon,
  Settings2Icon,
  SplitIcon,
  UsersIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { useSound } from '../state/SoundContext';
import { useRole } from '../state/RoleContext';
import { useTables } from '../state/TableContext';
import { useSettings } from '../state/SettingsContext';
import { useDevice } from '../state/DeviceContext';
import { floorRooms } from '../data/pos';
import { api } from '../api/client';
import { GatewayTiles } from '../components/pay/GatewayTiles';
import { SplitBill } from '../components/pay/SplitBill';
import { printSplitReceipts } from '../utils/printReceipt';

// --- per-state presentation. Icon + label + pattern, so status is readable
//     even without colour (the legend up top repeats these shapes).
const STATE_META = {
  Open: {
    label: 'Vacant',
    icon: null,
    band: 'bg-canvas text-meta',
    tile: 'border-line bg-surface',
    legend: 'border-line bg-canvas text-meta'
  },
  Seated: {
    label: 'Seated',
    icon: <UsersIcon className="h-3 w-3" />,
    band: 'bg-tint-amber text-status-amber',
    tile: 'border-status-amber/40 bg-surface',
    legend: 'border-status-amber/30 bg-tint-amber text-status-amber'
  },
  'Check dropped': {
    label: 'Check dropped',
    icon: <ReceiptIcon className="h-3 w-3" />,
    band: 'bg-tint-blue text-status-blue',
    tile: 'border-status-blue/40 bg-surface',
    legend: 'border-status-blue/30 bg-tint-blue text-status-blue'
  },
  'Needs attention': {
    label: 'Action needed',
    icon: <AlertTriangleIcon className="h-3 w-3" />,
    band: 'bg-tint-red text-status-red',
    tile: 'border-status-red/50',
    legend: 'border-status-red/30 bg-tint-red text-status-red'
  }
};

// Demo staff + upcoming reservations — the floor model doesn't persist these,
// so the board derives them deterministically for presentation.
const SERVERS = ['Riya', 'Arjun', 'Aayush', 'Sara'];
const RESERVED = {
  T1: { at: '18:30', party: 4 },
  T8: { at: '19:15', party: 2 },
  T10: { at: '20:00', party: 6 }
};

const serverOf = (name) => {
  const sum = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return SERVERS[sum % SERVERS.length];
};

const initialsOf = (name) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const elapsedMin = (t) => {
  const m = /(\d+)\s*min/.exec(t.detail || '');
  return m ? Number(m[1]) : 0;
};

const coversOf = (t) => {
  if (t.state === 'Open') return 0;
  const m = /(\d+)\s*covers?/.exec(t.detail || '');
  return m ? Number(m[1]) : 1;
};

const voidReasons = ['Comp', 'Mistake', 'Guest walked', 'Other'];

const qrFor = (table) => `${window.location.origin}/register/customer?table=${encodeURIComponent(table.name)}`;

function TableTile({ t, active, onOpen, onEdit, onQr, canEdit, held, order }) {
  const meta = STATE_META[t.state] || STATE_META.Open;
  const occupied = t.state !== 'Open';
  const covers = coversOf(t);
  const mins = elapsedMin(t);
  const res = RESERVED[t.name];
  const server = serverOf(t.name);
  const stripes = t.state === 'Needs attention'
    ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(208,52,44,0.07) 0, rgba(208,52,44,0.07) 12px, rgba(255,255,255,0.45) 12px, rgba(255,255,255,0.45) 24px)' }
    : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={active}
      className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-150 ease-soft hover:shadow-card ${
        meta.tile
      } ${active ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
      style={stripes}>

      {/* status band — icon + label, colour is just reinforcement */}
      <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${meta.band}`}>
        <span className="flex items-center gap-1.5 text-caption font-semibold">
          {meta.icon}
          {meta.label}
          {t.state === 'Check dropped' && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-blue" aria-hidden="true" />
          )}
        </span>
        {occupied && (
          <span className={`flex items-center gap-1 font-mono text-caption font-bold ${
            t.state === 'Needs attention' ? 'text-status-red' : ''
          }`}>
            <ClockIcon className="h-3 w-3" />
            {mins > 0 ? `${mins}m` : '—'}
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xl font-black leading-none text-ink">{t.name}</p>
            <p className="mt-1.5 text-xs font-semibold text-meta">
              {t.seats} seats{occupied ? ` · ${covers} of ${t.seats}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 focus-within:opacity-100">
            {canEdit && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Edit ${t.name}`}
                onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onEdit(t); } }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-meta hover:bg-surface hover:text-ink">
                <Edit2Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label={`QR code for ${t.name}`}
              onClick={(e) => { e.stopPropagation(); onQr(t); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onQr(t); } }}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-meta hover:bg-surface hover:text-ink">
              <QrCodeIcon className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {/* live order snapshot — what this table actually ordered. Only ever
            rendered from server-polled order data, so a vacant table shows
            nothing here. */}
        {order && (
          <div className="mt-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2">
            {order.items.length > 0 ? (
              <p className="truncate text-caption font-bold text-ink">
                {order.items.slice(0, 2).map((it) => `${it.qty}× ${it.name}`).join(', ')}
                {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
              </p>
            ) : (
              <p className="truncate text-caption font-bold text-ink">
                {order.itemCount || 0} item{(order.itemCount || 0) === 1 ? '' : 's'} ordered
              </p>
            )}
            <p className="mt-0.5 font-mono text-caption font-bold text-meta">Rs {order.total.toLocaleString('en-IN')}</p>
          </div>
        )}

        {/* occupancy — shape not colour, so it reads in mono */}
        <div className="mt-2.5 flex items-center gap-1" aria-label={`${covers} of ${t.seats} seats occupied`}>
          {Array.from({ length: Math.max(t.seats, 1) }).map((_, i) => (
            <span
              key={i}
              className={`text-base leading-none ${i < covers ? 'text-ink' : 'text-meta/30'}`}
              aria-hidden="true">
              ●
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {occupied && (
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ink">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[9px] font-black text-white">
                {initialsOf(server)}
              </span>
              {server}
            </span>
          )}
          {res && (
            <span className="flex items-center gap-1 rounded-full border border-status-purple/25 bg-tint-purple px-2 py-0.5 text-xs font-bold text-status-purple">
              <CalendarIcon className="h-3 w-3" />
              RES {res.at}
            </span>
          )}
          {held && (
            <span className="flex items-center gap-1 rounded-full border border-status-amber/25 bg-tint-amber px-2 py-0.5 text-xs font-bold text-status-amber">
              Held
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

const STATE_ORDER = ['Needs attention', 'Seated', 'Check dropped', 'Open'];

function PhoneTableRow({ t, held, onOpen, order }) {
  const meta = STATE_META[t.state] || STATE_META.Open;
  const occupied = t.state !== 'Open';
  const covers = coversOf(t);
  const mins = elapsedMin(t);
  const res = RESERVED[t.name];
  const server = serverOf(t.name);
  const stripes = t.state === 'Needs attention'
    ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(208,52,44,0.06) 0, rgba(208,52,44,0.06) 12px, rgba(255,255,255,0.55) 12px, rgba(255,255,255,0.55) 24px)' }
    : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col rounded-card border bg-surface text-left transition-shadow duration-150 ease-soft ${
        t.state === 'Needs attention' ? 'border-status-red/50' : 'border-line'
      }`}
      style={stripes}>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-semibold ${meta.band}`}>
            {meta.icon}
            {meta.label}
            {t.state === 'Check dropped' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-blue" aria-hidden="true" />
            )}
          </span>
          {occupied && (
            <span className={`flex items-center gap-1 font-mono text-sm font-bold ${t.state === 'Needs attention' ? 'text-status-red' : ''}`}>
              <ClockIcon className="h-3 w-3" />
              {mins > 0 ? `${mins}m` : '—'}
            </span>
          )}
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xl font-black leading-none text-ink">{t.name}</p>
            <p className="mt-1 text-xs font-semibold text-meta">
              {t.seats} seats{occupied ? ` · ${covers} of ${t.seats}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {res && (
              <span className="flex items-center gap-1 rounded-full border border-status-purple/25 bg-tint-purple px-2 py-0.5 text-xs font-bold text-status-purple">
                <CalendarIcon className="h-3 w-3" />
                RES {res.at}
              </span>
            )}
            {held && (
              <span className="flex items-center gap-1 rounded-full border border-status-amber/25 bg-tint-amber px-2 py-0.5 text-xs font-bold text-status-amber">
                Held
              </span>
            )}
          </div>
        </div>

        {order && (
          <div className="mt-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2">
            <p className="truncate text-caption font-bold text-ink">
              {order.items.slice(0, 2).map((it) => `${it.qty}× ${it.name}`).join(', ')}
              {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
            </p>
            <p className="mt-0.5 font-mono text-caption font-bold text-meta">Rs {order.total.toLocaleString('en-IN')}</p>
          </div>
        )}

        {occupied && (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ink">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[9px] font-black text-white">
                {initialsOf(server)}
              </span>
              {server}
            </span>
            <span className="text-caption font-semibold text-meta">Tap for actions</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function FrontOfHouse() {
  const toast = useToast();
  const { play } = useSound();
  const navigate = useNavigate();
  const { role } = useRole();
  const { settings } = useSettings();
  const { isPhone } = useDevice();
  const {
    tables: floorTables,
    rooms,
    freeTable,
    occupiedCount,
    renameTable,
    labelOf,
    setSeats,
    seatsOf,
    addRoom,
    renameRoom,
    removeRoom,
    setRoom,
    markOrdered,
    orderInfoOf
  } = useTables();
  const [selected, setSelected] = useState(null);
  const [split, setSplit] = useState(0);
  const [heldOrders, setHeldOrders] = useState([]);
  const [filter, setFilter] = useState('All');

  // Keep the detail panel in sync when table states change under it and pick
  // a sensible table on mount. Phones land on the list instead of a sheet.
  useEffect(() => {
    if (isPhone) return;
    setSelected((prev) => {
      if (prev && floorTables.some((t) => t.name === prev.name)) return prev;
      const seated = floorTables.find((t) => t.state !== 'Open');
      return seated || floorTables[0] || null;
    });
  }, [floorTables, isPhone]);

  const canRename = role === 'boss' || role === 'manager';
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSeats, setEditSeats] = useState('2');
  const [editRoom, setEditRoom] = useState('');
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [roomEdits, setRoomEdits] = useState({});
  const [roomRemove, setRoomRemove] = useState(null);

  const openEdit = useCallback((t) => {
    setEditTarget(t);
    setEditName(labelOf(t.name));
    setEditSeats(String(seatsOf(t.name, t.seats)));
    setEditRoom(t.room);
  }, [labelOf, seatsOf]);

  function saveTableEdit() {
    if (!editTarget) return;
    renameTable(editTarget.name, editName.trim());
    setSeats(editTarget.name, Number(editSeats));
    if (editRoom) setRoom(editTarget.name, editRoom);
    toast('Table updated', { tone: 'green' });
    setEditTarget(null);
  }

  const [qrTarget, setQrTarget] = useState(null);

  // --- table actions ---
  const [viewOpen, setViewOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payCovers, setPayCovers] = useState(1);
  const [payView, setPayView] = useState('simple'); // simple | split — one sheet, two views
  const [splitBusy, setSplitBusy] = useState(false);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidManager, setVoidManager] = useState('');
  const [voidTarget, setVoidTarget] = useState(null);

  const sel = isPhone ? selected : (selected || floorTables[0] || null);
  // Line items come straight from the backend bill endpoint (GET
  // /pos/tables/:id/bill), cached per order id: the /tables poll tells us
  // WHICH order sits on each table (id, total, item count); line items are
  // fetched once per order and shared by the tiles, the detail panel and the
  // pay/split sheets. A vacant table has no orderId → no fetch, no cache
  // entry, and every surface shows a BLANK check — never leftover data from
  // a previous guest.
  const [billCache, setBillCache] = useState({}); // orderId -> { order_id, items, total }
  useEffect(() => {
    const targets = floorTables.filter((t) => t.orderId && billCache[t.orderId] === undefined);
    if (targets.length === 0) return undefined;
    let cancelled = false;
    Promise.all(
      targets.map((t) =>
        api(`/pos/tables/${t.id}/bill`)
          .then((r) => [t.orderId, r || { items: [], total: 0 }])
          .catch(() => [t.orderId, { items: [], total: 0 }])
      )
    ).then((pairs) => {
      if (cancelled) return;
      setBillCache((prev) => {
        const next = { ...prev };
        for (const [id, r] of pairs) next[id] = r;
        // keep the cache bounded across a long shift
        const keys = Object.keys(next);
        if (keys.length > 60) delete next[keys[0]];
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [floorTables, billCache]);
  // The live check for the selected table, straight from real orders (register
  // charges and customer QR orders write it via setTableOrder). Tables that are
  // not holding an open, live order show an EMPTY check — never the seeded demo
  // bill, so a Vacant table never re-opens with leftover items or totals.
  const selOrder = sel ? orderInfoOf(sel.name) : null;
  const selBill = sel?.orderId ? billCache[sel.orderId] : undefined;
  // Authoritative line items + total come from the bill cache; totals fall
  // back to the polled /tables data until the bill response arrives. A vacant
  // table (no open order) shows an EMPTY check — never a seeded demo bill, so
  // a turned-over table never re-opens with leftover items.
  const tableBillLive = ((Array.isArray(selBill?.items) ? selBill.items : selBill?.total) || []).map((it) => ({
    item: it.name,
    amount: (it.qty || 1) * it.price,
    qty: it.qty || 1
  }));
  const billTotal = selBill ? selBill.total : (selOrder?.total || 0);
  const liveOrderId = selBill?.order_id || selOrder?.orderId || '';

  /** Live order info for a tile: poll data + cached line items (if fetched). */
  const liveOrderOf = useCallback((t) => {
    const oi = orderInfoOf(t.name);
    if (!oi) return null;
    const bill = billCache[oi.orderId];
    return { ...oi, items: ((Array.isArray(bill?.items) ? bill.items : bill?.total) || []).map((it) => ({ name: it.name, qty: it.qty || 1 })) };
  }, [orderInfoOf, billCache]);

  const payKey = useCallback((k) => {
    setPayAmount((prev) => {
      if (k === '⌫') return prev.slice(0, -1);
      if (k === 'Clear') return '';
      if (prev.includes('.') && k === '.') return prev;
      if (k === '.' && prev === '') return '0.';
      return prev + k;
    });
  }, []);

  const confirmPayment = useCallback(async () => {
    const amt = parseInt(payAmount.replace(/\D/g, ''), 10) || 0;
    if (amt <= 0 || !selected) return;
    try {
      await api('/transactions', {
        method: 'POST',
        body: {
          order_id: liveOrderId,
          method: payMethod.toLowerCase().replace('split', 'card'),
          amount: amt,
          ref: '',
          split_id: '',
          split_note: `FOH payment · ${labelOf(selected.name)}`
        }
      });
      setPaymentOpen(false);
      setPayView('simple');
      setPayAmount('');
      setSplit(0);
      setPayCovers(1);
      freeTable(selected.name);
      play('paymentSuccess');
      toast.success(`Paid Rs ${amt.toLocaleString('en-IN')} · ${payMethod} · ${labelOf(selected.name)} · table open`);
    } catch {
      play('paymentFailed');
      toast('Payment could not be recorded right now — no backend connection', { tone: 'red', silent: true });
    }
  }, [payAmount, payMethod, selected, liveOrderId, freeTable, labelOf, toast, play]);

  const confirmSplit = useCallback(async (segments) => {
    if (!selected) return;
    setSplitBusy(true);
    try {
      for (let i = 0; i < segments.length; i++) {
        await api('/transactions', {
          method: 'POST',
          body: {
            order_id: liveOrderId,
            method: segments[i].method.toLowerCase(),
            amount: segments[i].amount,
            ref: '',
            split_id: `s-${Date.now()}`,
            split_note: `${labelOf(selected.name)} · Guest ${i + 1} of ${segments.length}`
          }
        });
      }
      setPaymentOpen(false);
      setPayView('simple');
      setPayAmount('');
      setSplit(0);
      setPayCovers(1);
      freeTable(selected.name);
      printSplitReceipts({
        tableName: labelOf(selected.name),
        items: tableBillLive.map((l, i) => ({ id: `bill-${i}`, name: l.item, qty: l.qty || 1, price: l.amount })),
        segments
      }, settings);
      const sum = segments.reduce((s, g) => s + g.amount, 0);
      toast.success(`Split bill settled · Rs ${sum.toLocaleString('en-IN')} across ${segments.length} guests · ${labelOf(selected.name)} · table open`);
    } catch {
      toast('Split could not be recorded right now — no backend connection', { tone: 'red' });
    } finally {
      setSplitBusy(false);
    }
  }, [selected, liveOrderId, tableBillLive, freeTable, labelOf, toast, settings]);

  const holdOrder = useCallback(() => {
    if (!sel) return;
    setHeldOrders((h) => [...h, { ...sel, heldAt: Date.now() }]);
    toast(`Order held for ${labelOf(sel.name)}`);
  }, [sel, labelOf, toast]);

  const resumeOrder = useCallback((order) => {
    setHeldOrders((h) => h.filter((o) => o.name !== order.name));
    toast.success(`Order resumed for ${labelOf(order.name)}`);
  }, [labelOf, toast]);

  const openVoid = useCallback(() => {
    if (!sel) return;
    setVoidTarget(sel);
    setVoidReason('');
    setVoidManager('');
    setVoidOpen(true);
  }, [sel]);

  const confirmVoid = useCallback(() => {
    if (!voidReason || !voidManager.trim()) return;
    setVoidOpen(false);
    setVoidReason('');
    setVoidManager('');
    setVoidTarget(null);
    toast.error(`Check voided · ${voidTarget ? labelOf(voidTarget.name) : ''}`);
  }, [voidReason, voidManager, voidTarget, labelOf, toast]);

  // --- the requested action set ---
  const openPay = useCallback(() => {
    if (!sel || sel.state === 'Open') {
      toast('Table is vacant — nothing to pay');
      return;
    }
    setPayAmount(String(billTotal));
    setPayView('simple');
    setPaymentOpen(true);
  }, [sel, billTotal, toast]);

  const openSplitView = useCallback(() => {
    if (!sel || sel.state === 'Open' || billTotal <= 0) {
      toast('Table is vacant — nothing to split');
      return;
    }
    setPayView('split');
    setPaymentOpen(true);
  }, [sel, billTotal, toast]);

  const openView = useCallback(() => {
    if (!sel || sel.state === 'Open') {
      toast('Table is vacant — no order to view');
      return;
    }
    setViewOpen(true);
  }, [sel, toast]);

  const addItems = useCallback(() => {
    if (!sel) return;
    navigate(`/register?table=${encodeURIComponent(sel.name)}`);
  }, [sel, navigate]);

  const confirmTransfer = useCallback((target) => {
    if (!sel || !target || target.name === sel.name) return;
    markOrdered(target.name);
    freeTable(sel.name);
    setSelected(target);
    setTransferOpen(false);
    toast.success(`Transferred ${labelOf(sel.name)} → ${labelOf(target.name)}`);
  }, [sel, markOrdered, freeTable, labelOf, toast]);

  const confirmMerge = useCallback((src) => {
    if (!src || !sel || src.name === sel.name) return;
    freeTable(src.name);
    setMergeOpen(false);
    toast.success(`Merged ${labelOf(src.name)} into ${labelOf(sel.name)}`);
  }, [sel, freeTable, labelOf, toast]);

  const confirmMove = useCallback((room) => {
    if (!sel || !room) return;
    setRoom(sel.name, room);
    setMoveOpen(false);
    toast.success(`${labelOf(sel.name)} moved to ${room}`);
  }, [sel, setRoom, labelOf, toast]);

  const confirmClose = useCallback(async () => {
    if (!sel) return;
    setCloseOpen(false);
    try {
      // Close every open order on this table server-side so the floor plan
      // derives the table back to 'Open' on every device.
      await api(`/pos/tables/${sel.id}/close`, { method: 'PUT' });
    } catch {
      // no backend / already closed — still turn the tile over locally
    }
    freeTable(sel.name);
    setSelected(floorTables.find((t) => t.name !== sel.name && t.state === 'Open') || floorTables.find((t) => t.name !== sel.name) || null);
    toast.success(`Table ${labelOf(sel.name)} closed · clean ready`);
  }, [sel, freeTable, labelOf, toast, floorTables]);

  const activeTables = filter === 'Held'
    ? heldOrders
    : floorTables.filter((t) => heldOrders.every((h) => h.name !== t.name));

  const chipOptions = heldOrders.length > 0 ? ['All', 'Held'] : ['All'];

  const roomGroups = floorRooms
    .map((room) => ({ room, tables: activeTables.filter((t) => t.room === room) }))
    .filter((g) => g.tables.length > 0);

  const selOccupied = sel && sel.state !== 'Open';
  const resCount = floorTables.filter((t) => RESERVED[t.name]).length;

  const actions = sel ? [
    { label: 'View order', icon: <EyeIcon className="h-4 w-4" />, run: openView, disabled: !selOccupied },
    { label: 'Add items', icon: <PlusIcon className="h-4 w-4" />, run: addItems, disabled: false },
    { label: 'Transfer', icon: <ArrowLeftRightIcon className="h-4 w-4" />, run: () => sel && setTransferOpen(true), disabled: !selOccupied },
    { label: 'Merge', icon: <CombineIcon className="h-4 w-4" />, run: () => sel && setMergeOpen(true), disabled: !selOccupied },
    { label: 'Split bill', icon: <SplitIcon className="h-4 w-4" />, run: openSplitView, disabled: !selOccupied || billTotal <= 0 },
    { label: 'Move table', icon: <MoveIcon className="h-4 w-4" />, run: () => sel && setMoveOpen(true), disabled: false },
    { label: 'Pay', icon: <BanknoteIcon className="h-4 w-4" />, run: openPay, disabled: !selOccupied },
    { label: 'Close', icon: <CheckIcon className="h-4 w-4" />, run: () => sel && setCloseOpen(true), disabled: !selOccupied }
  ] : [];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Front of House"
        descriptor={`${floorTables.length} tables · ${occupiedCount} seated · ${resCount} upcoming reservations`}>
      </PageHeader>

      {isPhone ? (
          <div className="flex flex-col gap-4">
            {chipOptions.length > 1 && (
              <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {chipOptions.map((c) => {
                  const active = filter === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(c)}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors duration-150 ease-soft ${
                        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta'
                      }`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            )}

            {STATE_ORDER.map((st) => {
              const rows = activeTables.filter((t) => t.state === st);
              if (rows.length === 0) return null;
              const meta = STATE_META[st];
              return (
                <section key={st}>
                  <header className="mb-2 flex items-center gap-2 px-0.5">
                    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold ${meta.legend}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-micro font-semibold text-meta">
                      {rows.length}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </header>
                  <div className="flex flex-col gap-2.5">
                    {rows.map((t) => (
                      <PhoneTableRow
                        key={t.name}
                        t={t}
                        held={heldOrders.some((h) => h.name === t.name)}
                        onOpen={() => setSelected(t)}
                        order={orderInfoOf(t.name)} />
                    ))}
                  </div>
                </section>
              );
            })}

            {activeTables.length === 0 && (
              <p className="rounded-card border border-line bg-surface px-4 py-8 text-center text-sm font-semibold text-meta">
                No tables to show here right now.
              </p>
            )}
          </div>
        ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            {/* legend — status is readable even without colour */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {Object.entries(STATE_META).map(([k, v]) =>
                <span key={k} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-semibold ${v.legend}`}>
                  {v.icon}
                  {v.label}
                </span>
              )}
              {heldOrders.length > 0 &&
                <Pill tone="amber" dot>
                  Held ({heldOrders.length})
                </Pill>
              }
              {canRename &&
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRoomsOpen(true)}>
                  <Settings2Icon className="h-3.5 w-3.5" /> Rooms
                </Button>
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
                    className={`h-8 rounded-full border px-3.5 text-13 font-semibold transition-colors duration-150 ease-soft ${
                      filter === c ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
                    }`}>
                    {c}
                  </button>
                )}
              </div>
            }

            {roomGroups.map((group) =>
              <div key={group.room} className="mb-6 last:mb-0">
                <div className="mb-2.5 flex items-center gap-2">
                  <h3 className="text-caption font-semibold text-ink">{group.room}</h3>
                  <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-micro font-semibold text-meta">
                    {group.tables.length} {group.tables.length === 1 ? 'table' : 'tables'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {group.tables.map((t) =>
                    <TableTile
                      key={t.name}
                      t={t}
                      active={sel && sel.name === t.name}
                      onOpen={() => setSelected(t)}
                      onEdit={openEdit}
                      onQr={setQrTarget}
                      canEdit={canRename}
                      held={heldOrders.some((h) => h.name === t.name)}
                      order={liveOrderOf(t)} />
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-ink">{sel ? labelOf(sel.name) : '—'}</h2>
                <p className="text-sm text-meta">{sel ? sel.detail : ''}</p>
              </div>
              {sel && <Pill tone={STATE_META[sel.state] ? (sel.state === 'Seated' ? 'amber' : sel.state === 'Check dropped' ? 'blue' : sel.state === 'Needs attention' ? 'red' : 'neutral') : 'neutral'} dot>{sel.state}</Pill>}
            </div>

            {/* the restaurant-facing action grid */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {actions.map((a) =>
                <button
                  key={a.label}
                  type="button"
                  disabled={a.disabled}
                  onClick={a.run}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface py-3 text-13 font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">
                  <span className="text-ink">{a.icon}</span>
                  {a.label}
                </button>
              )}
            </div>

            {sel && sel.state === 'Needs attention' &&
              <div className="mt-4">
                <AlertBanner>Allergy note open · peanuts — confirm with kitchen</AlertBanner>
              </div>
            }

            <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              {tableBillLive.map((l) =>
                <li key={l.item} className="flex justify-between">
                  <span>{l.item}</span>
                  <span className="font-mono font-semibold">Rs {l.amount.toLocaleString('en-IN')}</span>
                </li>
              )}
              <li className="flex justify-between border-t border-line pt-3 text-base">
                <span className="font-bold">Total</span>
                <span className="font-mono font-extrabold">Rs {billTotal.toLocaleString('en-IN')}</span>
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
                    <li key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                      <span className="text-meta">Cover {i + 1}</span>
                      <span className="font-mono font-semibold">Rs {Math.round(billTotal / split).toLocaleString('en-IN')}</span>
                    </li>
                  )}
                </ul>
              }
            </div>

            <div className="mt-5 flex gap-2">
              {sel && heldOrders.some((h) => h.name === sel.name) ?
                <Button variant="green" full onClick={() => resumeOrder(sel)}>
                  Resume order
                </Button> :
                <>
                  <Button variant="outline" onClick={holdOrder}>Hold</Button>
                  <Button variant="red" onClick={openVoid}>Void</Button>
                  <Button variant="dark" full onClick={openPay}>
                    Take payment
                  </Button>
                </>
              }
            </div>
          </Card>
        </div>
      )}

      {/* phone: table action sheet — the right-hand panel rebuilt for one hand */}
      {isPhone &&
        <BottomSheet
          open={!!sel}
          onClose={() => setSelected(null)}
          title={sel ? labelOf(sel.name) : ''}
          subtitle={sel ? `${sel.state}${sel.detail ? ` · ${sel.detail}` : ''}` : ''}>
          {sel && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-2">
                {actions.map((a) =>
                  <button
                    key={a.label}
                    type="button"
                    disabled={a.disabled}
                    onClick={a.run}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface py-3 text-13 font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">
                    <span className="text-ink">{a.icon}</span>
                    {a.label}
                  </button>
                )}
              </div>

              {sel.state === 'Needs attention' &&
                <AlertBanner>Allergy note open · peanuts — confirm with kitchen</AlertBanner>
              }

              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3.5 py-3">
                <span className="text-sm font-semibold text-ink">Bill total</span>
                <span className="font-mono text-lg font-black text-ink">Rs {billTotal.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex gap-2">
                {heldOrders.some((h) => h.name === sel.name) ?
                  <Button variant="green" full onClick={() => resumeOrder(sel)}>
                    Resume order
                  </Button> :
                  <>
                    <Button variant="outline" onClick={holdOrder}>Hold</Button>
                    <Button variant="red" onClick={openVoid}>Void</Button>
                    <Button variant="dark" full onClick={openPay}>
                      Take payment
                    </Button>
                  </>
                }
              </div>
            </div>
          )}
        </BottomSheet>
      }

      {/* view order */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={sel ? `Order · ${labelOf(sel.name)}` : ''}
        subtitle={sel ? `${sel.state} · ${elapsedMin(sel) > 0 ? `${elapsedMin(sel)} min` : 'just started'} · ${serverOf(sel.name)}` : ''}>
        {sel && (
          <div className="space-y-3">
            {selOrder ? (
              <div className="flex items-center justify-between rounded-lg bg-tint-blue/40 px-3 py-2 text-caption font-semibold text-ink">
                <span>Order {selOrder.ref} · {selOrder.itemCount || tableBillLive.length || 0} item{(selOrder.itemCount || tableBillLive.length || 0) === 1 ? '' : 's'}</span>
                <span className="font-mono">Rs {billTotal.toLocaleString('en-IN')}</span>
              </div>
            ) : (
              <p className="rounded-lg bg-canvas px-3 py-2 text-caption text-meta">No live order on this table yet.</p>
            )}
            {tableBillLive.map((l) =>
              <div key={l.item} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{l.item}</span>
                <span className="font-mono font-semibold">Rs {l.amount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <span className="font-bold">Total</span>
              <span className="font-mono font-extrabold">Rs {billTotal.toLocaleString('en-IN')}</span>
            </div>
            {RESERVED[sel.name] && (
              <p className="rounded-lg bg-tint-purple px-3 py-2 text-sm font-semibold text-status-purple">
                Reservation at {RESERVED[sel.name].at} · party of {RESERVED[sel.name].party}
              </p>
            )}
          </div>
        )}
      </Drawer>

      {/* transfer */}
      <Dialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={`Transfer ${sel ? labelOf(sel.name) : ''}`}
        subtitle="Move the guests and their order to an empty table"
        width="max-w-md"
        footer={
          <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
        }>
        {floorTables.filter((t) => t.name !== sel?.name && t.state === 'Open').length === 0 ? (
          <p className="text-sm text-meta">No empty tables to transfer to right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {floorTables
              .filter((t) => t.name !== sel?.name && t.state === 'Open')
              .map((t) =>
                <button
                  key={t.name}
                  type="button"
                  onClick={() => confirmTransfer(t)}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40 hover:bg-canvas">
                  <span>{labelOf(t.name)}</span>
                  <span className="font-mono text-xs font-semibold text-meta">{t.seats}p</span>
                </button>
              )}
          </div>
        )}
      </Dialog>

      {/* merge */}
      <Dialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title={`Merge into ${sel ? labelOf(sel.name) : ''}`}
        subtitle="Pick an occupied table to fold into this one — its table turns over"
        width="max-w-md"
        footer={
          <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
        }>
        {floorTables.filter((t) => t.name !== sel?.name && t.state !== 'Open').length === 0 ? (
          <p className="text-sm text-meta">No other occupied tables to merge.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {floorTables
              .filter((t) => t.name !== sel?.name && t.state !== 'Open')
              .map((t) =>
                <button
                  key={t.name}
                  type="button"
                  onClick={() => confirmMerge(t)}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40 hover:bg-canvas">
                  <span>{labelOf(t.name)}</span>
                  <span className="font-mono text-xs font-semibold text-meta">{t.seats}p</span>
                </button>
              )}
          </div>
        )}
      </Dialog>

      {/* move table to another room */}
      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={`Move ${sel ? labelOf(sel.name) : ''}`}
        subtitle="Relocate this table to another room on the floor plan"
        width="max-w-md"
        footer={
          <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
        }>
        <div className="grid grid-cols-2 gap-2">
          {rooms.map((r) =>
            <button
              key={r}
              type="button"
              onClick={() => confirmMove(r)}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-bold transition-colors duration-150 ease-soft ${
                r === sel?.room ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:border-ink/40 hover:bg-canvas'
              }`}>
              <span>{r}</span>
              <span className="font-mono text-xs font-semibold">
                {r === sel?.room ? 'here' : `${floorTables.filter((t) => t.room === r).length}`}
              </span>
            </button>
          )}
        </div>
      </Dialog>

      {/* close table */}
      <Dialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Close ${sel ? labelOf(sel.name) : ''}?`}
        subtitle="No payment is recorded when you close this way"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Keep open</Button>
            <Button variant="dark" onClick={confirmClose}>
              Close table
            </Button>
          </>
        }>
        <p className="text-sm text-meta">
          The table turns over to <span className="font-semibold text-ink">Vacant</span> on the floor plan
          immediately. Use <span className="font-semibold text-ink">Pay</span> instead if a check still needs settling.
        </p>
      </Dialog>

      {/* payment */}
      <Dialog
        open={paymentOpen}
        onClose={() => { setPaymentOpen(false); setPayView('simple'); }}
        title={payView === 'split' ? 'Split the bill' : 'Collect payment'}
        subtitle={`${sel ? labelOf(sel.name) : ''} · Rs ${billTotal.toLocaleString('en-IN')} due`}
        width={payView === 'split' ? 'max-w-lg' : 'max-w-md'}
        footer={
          payView === 'split' ? (
            <Button variant="outline" onClick={() => setPayView('simple')}>Back to payment</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
              <Button variant="dark" full onClick={confirmPayment}>
                Pay Rs {parseInt(payAmount.replace(/\D/g, ''), 10).toLocaleString('en-IN') || '0'}
              </Button>
            </>
          )
        }>
        {payView === 'split' ? (
          <SplitBill
            total={billTotal}
            items={tableBillLive.map((l, i) => ({ id: `bill-${i}`, name: l.item, qty: l.qty || 1, price: l.amount }))}
            onCharge={confirmSplit}
            busy={splitBusy}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-canvas p-4 text-center">
              <span className="font-mono text-3xl font-extrabold text-ink">
                Rs {parseInt(payAmount.replace(/\D/g, ''), 10).toLocaleString('en-IN') || '0'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', '⌫'].map((k) =>
                <button
                  key={k}
                  type="button"
                  onClick={() => payKey(k)}
                  className="h-12 rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface">
                  {k}
                </button>
              )}
            </div>

            <div>
              <p className="mb-2 text-caption font-semibold text-meta">Payment method</p>
              <GatewayTiles value={payMethod} onChange={setPayMethod} />
            </div>

            {payMethod === 'Split' &&
              <div className="rounded-xl border border-line bg-canvas p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">Covers</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPayCovers((c) => Math.max(1, c - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface">
                      <MinusIcon className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-mono text-sm font-bold">{payCovers}</span>
                    <button
                      type="button"
                      onClick={() => setPayCovers((c) => Math.min(12, c + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface">
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {Array.from({ length: payCovers }).map((_, i) =>
                    <li key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                      <span className="text-meta">Guest {i + 1}</span>
                      <span className="font-mono font-semibold">Rs {Math.round(billTotal / payCovers).toLocaleString('en-IN')}</span>
                    </li>
                  )}
                </ul>
                <button
                  type="button"
                  onClick={() => setPayView('split')}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                  <SplitIcon className="h-4 w-4 text-meta" />
                  Split by guests or items
                </button>
              </div>
            }

            {payMethod !== 'Split' && billTotal > 0 && (
              <button
                type="button"
                onClick={() => setPayView('split')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-canvas py-2.5 text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                <SplitIcon className="h-4 w-4 text-meta" />
                Split bill
              </button>
            )}
          </div>
        )}
      </Dialog>

      <Drawer
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void check"
        subtitle={voidTarget ? labelOf(voidTarget.name) : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="red"
              full
              disabled={!voidReason || !voidManager.trim()}
              onClick={confirmVoid}>
              Confirm void
            </Button>
          </>
        }>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-caption font-semibold text-meta">Reason code</p>
            <div className="flex flex-wrap gap-2">
              {voidReasons.map((r) =>
                <button
                  key={r}
                  type="button"
                  aria-pressed={voidReason === r}
                  onClick={() => setVoidReason(r)}
                  className={`rounded-full border px-3.5 py-2 text-13 font-semibold transition-colors duration-150 ease-soft ${
                    voidReason === r
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:text-ink'
                  }`}>
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
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit table · ${editTarget ? labelOf(editTarget.name) : ''}`}
        subtitle="Changes apply across the app — floor, register, bookings."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              variant="dark"
              disabled={!editName.trim() || Number(editSeats) < 1}
              onClick={saveTableEdit}>
              Save changes
            </Button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Table display name">
            <input
              className={inputClass}
              placeholder={editTarget?.name || ''}
              value={editName}
              onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="Seats (how many people can sit)">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Fewer seats"
                onClick={() => setEditSeats((s) => String(Math.max(1, (Number(s) || 1) - 1)))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                −
              </button>
              <input
                type="number"
                min="1"
                max="30"
                className={`${inputClass} flex-1 text-center font-mono text-lg font-bold`}
                value={editSeats}
                onChange={(e) => setEditSeats(e.target.value)} />
              <button
                type="button"
                aria-label="More seats"
                onClick={() => setEditSeats((s) => String(Math.min(30, (Number(s) || 1) + 1)))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                +
              </button>
            </div>
          </Field>
          <Field label="Room">
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={editRoom === r}
                  onClick={() => setEditRoom(r)}
                  className={`rounded-full border px-3.5 py-1.5 text-13 font-semibold transition-colors duration-150 ease-soft ${
                    editRoom === r
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                  }`}>
                  {r}
                </button>
              ))}
              {canRename && (
                <button
                  type="button"
                  onClick={() => { setEditTarget(null); setRoomsOpen(true); }}
                  className="rounded-full border border-dashed border-line px-3.5 py-1.5 text-13 font-semibold text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink">
                  + New room
                </button>
              )}
            </div>
          </Field>
          <p className="text-xs text-meta">
            Original name <span className="font-mono font-semibold">{editTarget?.name}</span> is preserved internally for the order flow.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={roomsOpen}
        onClose={() => { setRoomsOpen(false); setNewRoom(''); setRoomEdits({}); setRoomRemove(null); }}
        title="Rooms"
        subtitle="Add, rename or remove the dining rooms on your floor plan."
        footer={
          <>
            <Button variant="outline" onClick={() => { setRoomsOpen(false); setNewRoom(''); setRoomEdits({}); setRoomRemove(null); }}>Done</Button>
            <Button
              variant="dark"
              disabled={!newRoom.trim()}
              onClick={() => {
                const ok = addRoom(newRoom);
                if (ok) toast(`Room added · ${newRoom.trim()}`, { tone: 'green' });
                else toast('That room already exists', { tone: 'red' });
                setNewRoom('');
              }}>
              Add room
            </Button>
          </>
        }>
        <div className="space-y-3">
          {rooms.map((room) => {
            const editing = roomEdits[room] !== undefined ? roomEdits[room] : null;
            const tableCount = floorTables.filter((t) => t.room === room).length;
            return (
              <div key={room} className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
                {editing !== null ? (
                  <input
                    autoFocus
                    className={`${inputClass} flex-1`}
                    value={editing}
                    onChange={(e) => setRoomEdits((p) => ({ ...p, [room]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const ok = renameRoom(room, editing);
                        if (ok) toast('Room renamed', { tone: 'green' });
                        else toast('Could not rename — duplicate name?', { tone: 'red' });
                        setRoomEdits((p) => { const n = { ...p }; delete n[room]; return n; });
                      }
                      if (e.key === 'Escape') {
                        setRoomEdits((p) => { const n = { ...p }; delete n[room]; return n; });
                      }
                    }} />
                ) : (
                  <div className="flex-1">
                    <p className="text-sm font-bold text-ink">{room}</p>
                    <p className="text-xs text-meta">{tableCount} {tableCount === 1 ? 'table' : 'tables'}</p>
                  </div>
                )}
                {editing === null && (
                  <>
                    <button
                      type="button"
                      aria-label={`Rename ${room}`}
                      onClick={() => setRoomEdits((p) => ({ ...p, [room]: room }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-meta transition-colors hover:bg-surface hover:text-ink">
                      <Edit2Icon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${room}`}
                      disabled={rooms.length <= 1}
                      onClick={() => setRoomRemove(room)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-meta transition-colors hover:bg-status-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <MinusIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {rooms.length <= 1 && (
            <p className="text-xs text-meta">At least one room is required.</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!roomRemove}
        onClose={() => setRoomRemove(null)}
        title={`Remove ${roomRemove || ''}?`}
        subtitle="Its tables will move to another room — nothing is deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setRoomRemove(null)}>Keep room</Button>
            <Button
              variant="red"
              onClick={() => {
                const ok = removeRoom(roomRemove);
                if (ok) toast(`Room removed · ${roomRemove}`, { tone: 'dark' });
                setRoomRemove(null);
              }}>
              Remove room
            </Button>
          </>
        }>
        <p className="text-sm text-meta">
          Tables currently in <span className="font-semibold text-ink">{roomRemove}</span> will be reassigned to another room automatically.
        </p>
      </Dialog>

      <Dialog
        open={!!qrTarget}
        onClose={() => setQrTarget(null)}
        title={`QR code · ${qrTarget ? labelOf(qrTarget.name) : ''}`}
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
            <span className="text-xs font-semibold text-ink">{qrTarget ? labelOf(qrTarget.name) : ''} · table ordering</span>
          </div>
          <p className="max-w-[320px] text-center text-xs text-meta">
            Guests scan this code to order straight from their phone — the table flips to
            {' '}<span className="font-semibold text-ink">Seated</span> on the floor plan the moment they
            open the menu, and every order they place is named after
            {' '}{qrTarget ? labelOf(qrTarget.name) : 'the table'}. No app download required.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
