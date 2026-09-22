import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BanknoteIcon,
  CheckIcon,
  ChevronRightIcon,
  Clock3Icon,
  FlameIcon,
  MegaphoneIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBagIcon,
  SlidersHorizontalIcon,
  TruckIcon,
  Trash2Icon,
  UserRoundIcon,
  UtensilsIcon,
  XIcon
} from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useOrders } from '../state/OrderContext';
import { useTables } from '../state/TableContext';
import { useMenu } from '../state/MenuContext';
import { useSettings } from '../state/SettingsContext';
import { api } from '../api/client';
import { printSplitReceipts, printReceiptHtml } from '../utils/printReceipt';
import { useCampaigns, campaignPhase, phaseWindow } from '../state/CampaignContext';
import { PaymentFlow } from '../components/pay/PaymentFlow';
import { useSound } from '../state/SoundContext';

const catDot = {
  'All items': 'bg-meta',
  'Momo & Snacks': 'bg-status-green',
  Mains: 'bg-status-blue',
  Grill: 'bg-status-amber',
  Bar: 'bg-status-purple',
  Dessert: 'bg-status-red'
};

const tableStateDot = {
  Open: 'bg-status-green',
  Seated: 'bg-status-blue',
  'Check dropped': 'bg-status-amber',
  'Needs attention': 'bg-status-red'
};

const MODIFIER_PRESETS = {
  'Momo & Snacks': ['Steam', 'Fry', 'Jhol'],
  Mains: ['Portion', 'Dosa / Ghee'],
  Grill: ['Mild', 'Medium', 'Hot'],
  Bar: ['Regular', 'Light'],
  Dessert: ['Standard', 'Large'],
  'All items': []
};

const POPULAR_NAMES = ['Momo Jhol', 'Chicken Chilli', 'Thakali Set', 'Mint Mojito'];

const RECENT_KEY = 'mesa_register_recent';

const toNumber = (price) => Number(String(price).replace(/[^0-9.]/g, ''));
const fmt = (n) => 'Rs ' + n.toLocaleString('en-IN');
const orderTypeIcon = { 'dine-in': UtensilsIcon, takeaway: ShoppingBagIcon, delivery: TruckIcon };

const CART_KEY = 'mesa_register_cart';

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readNotes() {
  try {
    return localStorage.getItem('mesa_register_notes') || '';
  } catch {
    return '';
  }
}

function readOrderType() {
  try {
    return localStorage.getItem('mesa_register_type') || 'dine-in';
  } catch {
    return 'dine-in';
  }
}

function readOrderTable() {
  try {
    return localStorage.getItem('mesa_register_table') || '';
  } catch {
    return '';
  }
}

function Kbd({ children }) {
  return (
    <kbd className="pointer-events-none hidden h-5 min-w-[20px] items-center justify-center rounded border border-line bg-canvas px-1 font-mono text-[10px] font-bold text-meta sm:inline-flex">
      {children}
    </kbd>
  );
}

function modifierChips(item) {
  const fromVariants = String(item.variants || '')
    .split(/[·/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromVariants.length > 0) return fromVariants;
  return MODIFIER_PRESETS[item.category] || [];
}

export function Register() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table');
  const toast = useToast();
  const { play } = useSound();
  const { addOrder } = useOrders();
  const { tables, occupyTable, freeTable, setTableOrder, labelOf } = useTables();
  const { settings } = useSettings();
  const { items: menuItems, categories: categoriesList } = useMenu();

  const [category, setCategory] = useState('All items');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(readCart);
  const [recent, setRecent] = useState(readRecent);
  const [orderNotes, setOrderNotes] = useState(readNotes);
  const [orderType, setOrderType] = useState(readOrderType);
  const [orderTable, setOrderTable] = useState(() => readOrderTable() || tableParam || '');
  const [customer, setCustomer] = useState('Walk-in');
  const [customerId, setCustomerId] = useState('');
  const [guests, setGuests] = useState([]);
  const [discount, setDiscount] = useState({ kind: 'none', value: 0 }); // none | percent | flat

  const [payOpen, setPayOpen] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const lastCharge = useRef(null);

  const [tableOpen, setTableOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');

  // Real guest profiles from the server — the picker only shows people who
  // actually exist in the database (no demo personas, and only names with a
  // real id get attached to the order).
  useEffect(() => {
    let cancelled = false;
    api('/guests')
      .then((res) => { if (!cancelled) setGuests((res?.data || []).map((g) => ({ id: g.id, name: g.name, phone: g.phone || '' }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [modLine, setModLine] = useState(null); // cart index
  const [modDraft, setModDraft] = useState(null); // { qty, mods, note }

  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef(null);
  const searchRef = useRef(null);
  const focusedOnce = useRef(false);

  const [orderRef, setOrderRef] = useState('');

  useEffect(() => {
    const raw = JSON.stringify(cart);
    try {
      localStorage.setItem(CART_KEY, raw);
    } catch {
      /* storage unavailable */
    }
    if (cart.length > 0 && !orderRef) {
      setOrderRef(`#${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
    }
    if (cart.length === 0) setOrderRef('');
  }, [cart, orderRef]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_notes', orderNotes);
    } catch { /* ignore */ }
  }, [orderNotes]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_type', orderType);
    } catch { /* ignore */ }
  }, [orderType]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_table', orderTable);
    } catch { /* ignore */ }
  }, [orderTable]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch { /* ignore */ }
  }, [recent]);

  // A scan of the table QR landed on the register — the table is occupied from
  // that moment, and every order placed here is named after that table.
  useEffect(() => {
    if (tableParam) occupyTable(tableParam);
  }, [tableParam, occupyTable]);

  // Focus the search once on desktop so the cashier can just start typing.
  useEffect(() => {
    if (!focusedOnce.current && window.matchMedia('(min-width: 1024px)').matches) {
      focusedOnce.current = true;
      searchRef.current?.focus();
    }
  }, []);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  const { campaignList } = useCampaigns();
  const campaign = campaignList.find((c) => c.status === 'Scheduled');
  const phase = campaignPhase(campaign);
  const promotedDish = campaign?.dish ? menuItems.find((i) => i.name === campaign.dish) : null;
  const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1);

  const catKeys = categoriesList.length > 0 ? categoriesList : ['All items'];

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return menuItems.filter(
        (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }
    return category === 'All items'
      ? menuItems
      : menuItems.filter((i) => i.category === category);
  }, [search, category, menuItems]);

  const popular = useMemo(
    () =>
      POPULAR_NAMES.map((n) => menuItems.find((i) => i.name === n)).filter(
        (i) => i && i.available
      ),
    [menuItems]
  );

  const recentItems = useMemo(
    () => recent.map((n) => menuItems.find((i) => i.name === n)).filter(Boolean),
    [recent, menuItems]
  );

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.qty * l.price, 0), [cart]);
  const discountAmount = useMemo(() => {
    if (discount.kind === 'percent') return Math.round((subtotal * discount.value) / 100);
    if (discount.kind === 'flat') return Math.min(discount.value, subtotal);
    return 0;
  }, [discount, subtotal]);
  const vat = Math.round((subtotal - discountAmount) * ((Number(settings.taxRate) || 13) / 100));
  const total = subtotal - discountAmount + vat;
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  const qtyOf = (name) => cart.find((l) => l.name === name)?.qty ?? 0;

  const catCount = (c) =>
    c === 'All items'
      ? menuItems.filter((i) => i.available).length
      : menuItems.filter((i) => i.category === c && i.available).length;

  const scrollToCurrentOrder = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    const el = document.getElementById('current-order');
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  };

  const pushRecent = (name) => {
    setRecent((r) => [name, ...r.filter((n) => n !== name)].slice(0, 4));
  };

  const add = (item) => {
    if (!item?.available) return;
    setCart((c) => {
      const existing = c.find((l) => l.name === item.name);
      if (existing) {
        return c.map((l) => (l.name === item.name ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...c,
        {
          id: item.id || '',
          name: item.name,
          price: item.priceNum ?? toNumber(item.price),
          category: item.category,
          qty: 1,
          mods: []
        }
      ];
    });
    pushRecent(item.name);
    scrollToCurrentOrder();
  };

  const inc = (i) => setCart((c) => c.map((l, idx) => (idx === i ? { ...l, qty: l.qty + 1 } : l)));
  const dec = (i) =>
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0));

  const clearCart = () => setCart([]);

  const onClear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      clearTimer.current = setTimeout(() => setClearArmed(false), 2600);
      return;
    }
    clearCart();
    setDiscount({ kind: 'none', value: 0 });
    setCustomer('Walk-in');
    setCustomerId('');
    setOrderNotes('');
    setClearArmed(false);
    toast('Order cleared', { tone: 'neutral' });
  };

  const openModify = (i) => {
    const line = cart[i];
    if (!line) return;
    setModLine(i);
    setModDraft({ qty: line.qty, mods: line.mods || [], note: line.note || '' });
  };

  const applyModify = () => {
    if (modLine == null || !modDraft) return;
    setCart((c) =>
      c.map((l, idx) =>
        idx === modLine ? { ...l, qty: modDraft.qty, mods: modDraft.mods, note: modDraft.note.trim() } : l
      )
    );
    setModLine(null);
    setModDraft(null);
  };

  const toggleMod = (m) =>
    setModDraft((d) => ({
      ...d,
      mods: d.mods.includes(m) ? d.mods.filter((x) => x !== m) : [...d.mods, m]
    }));

  const closeAll = () => {
    setPayOpen(false);
    setTableOpen(false);
    setCustomerOpen(false);
    setModLine(null);
    setModDraft(null);
    setGuestSearch('');
  };

  // Global keyboard: "/" focuses search, Esc closes/clears, 1-9 quick-adds.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (payOpen) return; // PaymentFlow owns its own keys (Enter / Esc)

      if (tableOpen || customerOpen || modLine != null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAll();
        }
        return; // dialogs capture everything else
      }

      if (e.key === 'Escape') {
        if (search) setSearch('');
        else setCategory('All items');
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) return;
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        const item = visibleItems[idx];
        if (item && item.available) {
          e.preventDefault();
          add(item);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleCampaignCta = () => {
    if (!campaign) return;
    if (promotedDish) {
      add(promotedDish);
      toast(`${promotedDish.name} added to the order`);
    } else {
      toast(`${campaign.name} — pre-order 15% off applies at the customer store`, { tone: 'green' });
    }
    scrollToCurrentOrder();
  };

  const openPayment = () => setPayOpen(true);

  // Promise-based charge: resolves true when the sale completed (online order
  // or offline ticket), false only on a genuine failure. PaymentFlow renders
  // PAYMENT SUCCESSFUL / PAYMENT FAILED from exactly this boolean.
  const chargeOnce = async (segments, noteSuffix = '') => {
    // Defensive: every segment must carry a payment method. SplitBill already
    // gates its Charge button on this; this guard keeps a stray call from
    // throwing mid-charge.
    if (!segments.length || segments.some((s) => !s?.method)) {
      toast('Pick a payment method for every segment first', { tone: 'red' });
      return false;
    }
    // Snapshot the bill for printing AFTER payment clears the cart.
    lastCharge.current = {
      items: cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
      subtotal,
      discountAmount,
      vat,
      total,
      type: orderType,
      table: orderTable || tableParam || '',
      customer
    };
    const paid = segments.map((s) => fmt(s.amount)).join(' + ');
    const paidTable = orderTable || tableParam || '';
    // No optimistic table writes here — the backend is the source of truth
    // and TableContext refreshes once the order actually exists.
    const splitId =
      segments.length > 1 ? (crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`) : '';
    const methodLabel =
      segments.length > 1
        ? `split (${segments.map((s) => s.method).join(' / ')})`
        : segments[0].method;
    const payloadItems = cart.map((l, i) => ({
      menu_item_id: l.id,
      name: l.name,
      qty: l.qty,
      price: l.price,
      notes: [
        l.mods && l.mods.length ? l.mods.join(' · ') : '',
        l.note || '',
        i === 0 && orderNotes.trim() ? orderNotes.trim() : ''
      ]
        .filter(Boolean)
        .join(' · ')
    }));

    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          type: orderType,
          table_id: orderTable || tableParam || '',
          guest_id: customerId || '',
          items: payloadItems
        }
      });
      const ref = `#${String(order.id).slice(0, 5).toUpperCase()}`;
      if (paidTable) {
        // Order exists server-side now — pull fresh table state (order id,
        // total, item count) into the floor plan immediately.
        setTableOrder(paidTable, { ref });
      }
      for (let i = 0; i < segments.length; i++) {
        await api('/transactions', {
          method: 'POST',
          body: {
            order_id: order.id,
            method: segments[i].method.toLowerCase(),
            amount: segments[i].amount,
            ref: '',
            split_id: splitId,
            split_note:
              segments.length > 1
                ? `${noteSuffix || 'Split bill'} · Guest ${i + 1} of ${segments.length}`
                : ''
          }
        });
      }
      setOrderNotes('');
      if (segments.length > 1) {
        printSplitReceipts({
          tableName: paidTable,
          orderRef: ref,
          items: cart.map((l) => ({ id: l.name, name: l.name, qty: l.qty, price: l.price })),
          segments
        }, settings);
      }
      clearCart();
      if (paidTable) freeTable(paidTable);
      play('paymentSuccess');
      window.dispatchEvent(new CustomEvent('mesa-order-update'));
      toast.success(
        `Paid ${paid} · ${methodLabel} · Order ${ref} sent to kitchen${paidTable ? ` · Table ${paidTable} open` : ''}`
      );
      return true;
    } catch (err) {
      // Only a genuine network failure (API unreachable) becomes an offline
      // ticket — the sale stays complete on this terminal. A server rejection
      // (validation, conflict) is NOT "sent": the cart stays so it can be
      // corrected and re-charged.
      if (!err || typeof err.status !== 'number') {
        const ticket = addOrder(cart, methodLabel, {
          notes: orderNotes,
          allergy: orderNotes,
          type: orderType,
          table: orderTable || tableParam || '—'
        });
        setOrderNotes('');
        clearCart();
        if (paidTable) freeTable(paidTable);
        if (ticket) {
          play('paymentSuccess');
          window.dispatchEvent(new CustomEvent('mesa-order-update'));
          toast.success(`Paid ${paid} · ${methodLabel} · Ticket ${ticket.id} recorded offline${paidTable ? ` · Table ${paidTable} open` : ''}`);
          return true;
        }
        play('paymentFailed');
        toast(`${methodLabel} could not be recorded — order kept`, { tone: 'red' });
        return false;
      }
      const detail = err?.body?.error || err?.message || 'the server rejected the order';
      toast(`Order not placed: ${detail}`, { tone: 'red' });
      return false;
    }
  };

  const handleCharge = (amount, method) => chargeOnce([{ amount, method: method.toLowerCase() }]);

  const handleSplit = async (segments) => {
    setSplitBusy(true);
    try {
      return await chargeOnce(segments, `Split · ${segments.length} guests`);
    } finally {
      setSplitBusy(false);
    }
  };

  const handlePrintReceipt = ({ method, tendered, change }) => {
    const snap = lastCharge.current || { items: [], subtotal, discountAmount, vat, total, type: '', table: '', customer: '' };
    const breakdown = [
      ['Subtotal', fmt(snap.subtotal)],
      ...(snap.discountAmount > 0 ? [['Discount', `−${fmt(snap.discountAmount)}`]] : []),
      [`VAT (${Number(settings.taxRate) || 13}%)`, fmt(snap.vat)]
    ];
    printReceiptHtml({
      title: 'Mesa OS',
      subtitle: snap.type
        ? `${snap.type}${snap.table ? ` · Table ${snap.table}` : ''}${snap.customer && snap.customer !== 'Walk-in' ? ` · ${snap.customer}` : ''}`
        : 'Receipt',
      subline: snap.table ? `Table ${snap.table}` : '',
      meta: `${snap.items.length} line${snap.items.length === 1 ? '' : 's'}`,
      items: snap.items.map((l) => [`${l.qty}× ${l.name}`, fmt(l.qty * l.price)]),
      ledger: breakdown,
      total: fmt(snap.total),
      paidBy: method,
      paidAt: new Date().toLocaleString(),
      footerLines: tendered > 0 ? [`Cash received ${fmt(tendered)} · change ${fmt(change)}`] : []
    }, settings);
  };

  const orderTypeLabel = orderType.charAt(0).toUpperCase() + orderType.slice(1);
  const selectedTable = orderTable
    ? tables.find((t) => t.name === orderTable)
    : null;

  return (
    <div className="mx-auto w-full max-w-[1560px]">
      <PageHeader title="Register" descriptor={`Register 1 · Riya on shift · ${orderTypeLabel} · ${itemCount} items`} />

      {tableParam && (
        <div className="mb-4 rounded-xl border border-status-blue/25 bg-tint-blue px-4 py-2.5 text-sm font-semibold text-status-blue">
          Scanned from table <span className="font-bold">{tableParam}</span> — this order will be routed to that table.
        </div>
      )}

      {campaign && phase !== 'hidden' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2">
          <MegaphoneIcon className="h-4 w-4 shrink-0 text-status-amber" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {campaign.dish ? `${campaign.dish} — ${campaign.name}` : campaign.name}
            <span className="ml-2 text-xs font-medium text-meta">
              {phaseName}
              {campaign.dish && phase === 'preorder' && ' · 15% off pre-orders'}
              {phaseWindow(campaign, phase) && ` · ${phaseWindow(campaign, phase)}`}
            </span>
          </p>
          <Button size="sm" variant="dark" onClick={handleCampaignCta}>
            {phase === 'preorder' ? 'Pre-order · 15% off' : promotedDish ? `Order ${promotedDish.name.split(' ')[0]}` : 'Order'}
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)_minmax(380px,420px)]">
        {/* LEFT — category rail */}
        <aside className="hidden lg:block">
          <nav className="scroll-thin sticky top-24 flex max-h-[calc(100vh-8rem)] flex-col gap-1 overflow-y-auto pr-1">
            {catKeys.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c)}
                  className={`flex h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold transition-colors duration-150 ease-soft ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                  }`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${catDot[c] || 'bg-meta'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">{c}</span>
                  <span className={`font-mono text-caption ${active ? 'text-white/60' : 'text-meta'}`}>
                    {catCount(c)}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* CENTER — search + items */}
        <div className="min-w-0">
          <div className="mb-4">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the menu — try “momo” or “bar”"
                aria-label="Search menu"
                className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-16 text-base text-ink placeholder:text-meta focus:border-ink focus:outline-none"
              />
              <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-meta hover:bg-canvas hover:text-ink">
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
                <Kbd>/</Kbd>
              </div>
            </div>

            {/* mobile category chips (rail is hidden below lg) */}
            <div className="scroll-thin -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
              {catKeys.map((c) => {
                const active = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(c)}
                    className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ease-soft ${
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                    }`}>
                    <span className={`h-2 w-2 rounded-full ${catDot[c] || 'bg-meta'}`} aria-hidden="true" />
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {!search && category === 'All items' && popular.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <FlameIcon className="h-4 w-4 text-status-amber" />
                <h2 className="text-caption font-semibold text-meta">Popular</h2>
              </div>
              <div className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {popular.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => add(p)}
                    className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all duration-150 ease-soft hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-pop">
                    {p.photo ? (
                      <img src={p.photo} alt={p.name} className="h-24 w-full object-cover" />
                    ) : (
                      <div className="h-24 w-full bg-canvas" />
                    )}
                    <div className="flex-1 p-3">
                      <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-mono text-sm font-extrabold text-ink">{p.price}</span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-green text-status-green transition-transform duration-150 ease-soft group-hover:scale-110">
                          <PlusIcon className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!search && category === 'All items' && recentItems.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <Clock3Icon className="h-4 w-4 text-meta" />
                <h2 className="text-caption font-semibold text-meta">Recent</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentItems.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => add(r)}
                    className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30 hover:bg-canvas">
                    {r.name}
                    <span className="font-mono text-caption text-meta">{r.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleItems.length === 0 ? (
            <EmptyState
              icon={<PackageIcon className="h-6 w-6" />}
              title={search ? 'Nothing matches the search' : 'No items in this category'}
              description={search ? `No menu items match “${search}”.` : 'Try another category.'}
            />
          ) : category === 'All items' && !search ? (
            <>
              {catKeys.filter((c) => c !== 'All items').map((c) => {
                const rows = menuItems.filter((i) => i.category === c);
                if (rows.length === 0) return null;
                return (
                  <div key={c} className="mb-6">
                    <div className="mb-2 flex items-baseline justify-between">
                      <h2 className="flex items-center gap-2 text-caption font-semibold text-meta">
                        <span className={`h-2 w-2 rounded-full ${catDot[c] || 'bg-meta'}`} aria-hidden="true" />
                        {c}
                      </h2>
                      <span className="font-mono text-caption text-meta">{rows.length}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {rows.map((item, i) => (
                        <MenuTile
                          key={item.name}
                          item={item}
                          qty={qtyOf(item.name)}
                          index={i < 9 ? i + 1 : null}
                          onAdd={() => add(item)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item, i) => (
                <MenuTile
                  key={item.name}
                  item={item}
                  qty={qtyOf(item.name)}
                  index={i < 9 ? i + 1 : null}
                  onAdd={() => add(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — current order */}
        <div
          id="current-order"
          className="flex max-h-[calc(100vh-8rem)] scroll-mt-24 flex-col self-start rounded-card border border-line bg-surface lg:sticky lg:top-20">
          {/* header */}
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight text-ink">Current order</h2>
                {orderRef && cart.length > 0 && (
                  <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-caption font-bold text-meta">
                    {orderRef}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-meta">
                {cart.length === 0
                  ? 'Empty — tap an item to start'
                  : `${itemCount} item${itemCount > 1 ? 's' : ''} · ${cart.length} line${cart.length > 1 ? 's' : ''}`}
                {orderTable && ` · Table ${labelOf(orderTable)}`}
                {customer !== 'Walk-in' && ` · ${customer}`}
              </p>
            </div>
            <Button variant={clearArmed ? 'danger' : 'quiet'} size="sm" onClick={onClear} disabled={cart.length === 0 && !clearArmed}>
              {clearArmed ? 'Confirm?' : 'Clear'}
            </Button>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
            {/* order type */}
            <div className="flex items-center gap-1.5">
              {Object.keys(orderTypeIcon).map((t) => {
                const Icon = orderTypeIcon[t];
                const active = t === orderType;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOrderType(t)}
                    className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border text-13 font-bold transition-colors duration-150 ease-soft ${
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-canvas text-meta hover:text-ink'
                    }`}>
                    <Icon className="h-4 w-4" />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* table + customer */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTableOpen(true)}
                className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold transition-colors duration-150 ease-soft ${
                  selectedTable ? 'border-status-blue/30 bg-tint-blue text-status-blue' : 'border-line bg-canvas text-meta hover:border-ink/30'
                }`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <UtensilsIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{selectedTable ? labelOf(orderTable) : 'Table'}</span>
                  {selectedTable && (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tableStateDot[selectedTable.state] || 'bg-meta'}`} aria-hidden="true" />
                  )}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setCustomerOpen(true)}
                className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold transition-colors duration-150 ease-soft ${
                  customer !== 'Walk-in' ? 'border-status-purple/30 bg-tint-purple text-status-purple' : 'border-line bg-canvas text-meta hover:border-ink/30'
                }`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <UserRoundIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{customer}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {/* lines */}
            <div className="mt-3 space-y-2">
              {cart.length === 0 ? (
                <EmptyState
                  compact
                  icon={<PackageIcon className="h-6 w-6" />}
                  title="No items yet"
                  description="Tap a menu item to add it. 1–9 quick-adds from the grid."
                />
              ) : (
                cart.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="rounded-xl border border-line bg-canvas p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{l.name}</p>
                        {(l.mods?.length > 0 || l.note) && (
                          <p className="truncate text-caption text-meta">
                            {[l.mods?.join(' · '), l.note].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Options for ${l.name}`}
                        onClick={() => openModify(i)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink">
                        <SlidersHorizontalIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Fewer ${l.name}`}
                          onClick={() => dec(i)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                          <MinusIcon className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center font-mono text-base font-extrabold text-ink">{l.qty}</span>
                        <button
                          type="button"
                          aria-label={`More ${l.name}`}
                          onClick={() => inc(i)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-ink">{fmt(l.qty * l.price)}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${l.name}`}
                          onClick={() => setCart((c) => c.filter((_, idx) => idx !== i))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-meta transition-colors duration-150 ease-soft hover:border-status-red/40 hover:text-status-red">
                          <Trash2Icon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* notes */}
            {cart.length > 0 && (
              <div className="mt-3">
                <label className="block text-caption font-semibold text-meta">
                  Order notes / allergy
                </label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="e.g. Allergy: peanuts · no coriander"
                  className="mt-1 w-full rounded-xl border border-line bg-canvas p-2.5 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* totals + payment */}
          {cart.length > 0 && (
            <div className="border-t border-line px-4 pt-3">
              <div className="rounded-xl border border-line bg-canvas p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-meta">Discount</span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {[
                      { label: 'None', kind: 'none', value: 0 },
                      { label: '10%', kind: 'percent', value: 10 },
                      { label: '15%', kind: 'percent', value: 15 },
                      { label: '20%', kind: 'percent', value: 20 },
                      { label: 'Rs 100', kind: 'flat', value: 100 }
                    ].map((d) => {
                      const active = discount.kind === d.kind && discount.value === d.value;
                      return (
                        <button
                          key={d.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setDiscount({ kind: d.kind, value: d.value })}
                          className={`h-7 shrink-0 rounded-full border px-2.5 text-caption font-bold transition-colors duration-150 ease-soft ${
                            active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                          }`}>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-meta">Subtotal</span>
                  <span className="font-mono font-semibold text-ink">{fmt(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-meta">Discount</span>
                    <span className="font-mono font-semibold text-status-red">−{fmt(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-meta">VAT (13%)</span>
                  <span className="font-mono font-semibold text-ink">{fmt(vat)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <span className="text-base font-extrabold text-ink">Total</span>
                  <span className="font-mono text-xl font-extrabold tracking-tight text-ink">{fmt(total)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-line p-4">
            <Button
              variant="dark"
              full
              disabled={cart.length === 0}
              onClick={openPayment}
              className="h-14 justify-center gap-2 text-base">
              <BanknoteIcon className="h-5 w-5" />
              Charge {fmt(total)}
            </Button>
            <p className="mt-2 text-center text-caption text-meta">
              <Kbd>Enter</Kbd> confirms on the payment screen
            </p>
          </div>
        </div>
      </div>

      {/* payment */}
      <PaymentFlow
        open={payOpen}
        total={total}
        subtotal={subtotal}
        discountAmount={discountAmount}
        vat={vat}
        itemCount={cart.length}
        type={orderTypeLabel}
        table={orderTable ? labelOf(orderTable) : tableParam}
        customer={customer}
        items={cart.map((l, i) => ({ id: `${l.name}-${i}`, name: l.name, qty: l.qty, price: l.price }))}
        splitBusy={splitBusy}
        onCharge={handleCharge}
        onSplit={handleSplit}
        onPrint={handlePrintReceipt}
        onDone={() => setPayOpen(false)}
        onClose={() => setPayOpen(false)}
      />

      {/* table picker */}
      <Dialog
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        title="Assign a table"
        subtitle="Tap a table to attach this order to it"
        width="max-w-lg"
        footer={
          <Button variant="outline" full onClick={() => { setOrderTable(''); setTableOpen(false); }}>
            Walk-in / no table
          </Button>
        }>
        <div className="scroll-thin max-h-[60vh] overflow-y-auto">
          {['Open', 'Seated', 'Check dropped'].map((stateFilter) => {
            const rows = tables.filter((t) => t.state === stateFilter || (stateFilter === 'Seated' && t.state === 'Needs attention'));
            if (rows.length === 0) return null;
            return (
              <div key={stateFilter} className="mb-3">
                <p className="mb-1.5 text-caption font-semibold text-meta">{stateFilter}</p>
                <div className="flex flex-wrap gap-2">
                  {rows.map((t) => {
                    const active = orderTable === t.name;
                    return (
                      <button
                        key={t.name}
                        type="button"
                        aria-pressed={active}
                        onClick={() => { setOrderTable(t.name); setTableOpen(false); }}
                        className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold transition-colors duration-150 ease-soft ${
                          active
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-canvas text-ink hover:border-ink/30'
                        }`}>
                        <span className={`h-2 w-2 rounded-full ${tableStateDot[t.state] || 'bg-meta'}`} aria-hidden="true" />
                        {labelOf(t.name)}
                        <span className={`font-mono text-caption ${active ? 'text-white/60' : 'text-meta'}`}>{t.seats}p</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>

      {/* customer picker */}
      <Dialog
        open={customerOpen}
        onClose={() => { setCustomerOpen(false); setGuestSearch(''); }}
        title="Customer"
        subtitle="Attach a regular guest or leave as walk-in"
        width="max-w-md"
        footer={
          <Button variant="outline" full onClick={() => { setCustomer('Walk-in'); setCustomerId(''); setCustomerOpen(false); setGuestSearch(''); }}>
            Walk-in / no profile
          </Button>
        }>
        <input
          type="text"
          value={guestSearch}
          onChange={(e) => setGuestSearch(e.target.value)}
          placeholder="Search guests…"
          autoFocus
          className="mb-3 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
        />
        <div className="scroll-thin max-h-[50vh] space-y-1.5 overflow-y-auto">
          {guests
            .filter((g) => g.name.toLowerCase().includes(guestSearch.trim().toLowerCase()))
            .map((g) => {
              const active = customer === g.name;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setCustomer(g.name); setCustomerId(g.id); setCustomerOpen(false); setGuestSearch(''); }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-soft ${
                    active ? 'border-ink bg-ink text-white' : 'border-line bg-canvas text-ink hover:border-ink/30'
                  }`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caption font-bold ${active ? 'bg-white/15 text-white' : 'bg-canvas text-meta'}`}>
                    {g.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{g.name}</span>
                    {g.phone && <span className={`block text-xs ${active ? 'text-white/60' : 'text-meta'}`}>{g.phone}</span>}
                  </span>
                  {active && <CheckIcon className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          {guests.filter((g) =>
            g.name.toLowerCase().includes(guestSearch.trim().toLowerCase())
          ).length === 0 && (
            <p className="py-4 text-center text-sm text-meta">{guests.length === 0 ? 'No guest profiles yet.' : `No guests match “${guestSearch}”.`}</p>
          )}
        </div>
      </Dialog>

      {/* modifiers */}
      <Dialog
        open={modLine != null && modDraft != null}
        onClose={() => { setModLine(null); setModDraft(null); }}
        title={modLine != null ? cart[modLine]?.name : 'Options'}
        subtitle="Pick a preparation, add a note, then save"
        width="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => { setModLine(null); setModDraft(null); }}>
              Cancel
            </Button>
            <Button variant="dark" full onClick={applyModify}>
              Save to order
            </Button>
          </>
        }>
        {modLine != null && cart[modLine] && modDraft && (
          <div className="space-y-4">
            {(modifierChips(cart[modLine]).length > 0) && (
              <div>
                <p className="mb-2 text-caption font-semibold text-meta">Preparation</p>
                <div className="flex flex-wrap gap-2">
                  {modifierChips(cart[modLine]).map((m) => {
                    const on = modDraft.mods.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleMod(m)}
                        className={`flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold transition-colors duration-150 ease-soft ${
                          on ? 'border-ink bg-ink text-white' : 'border-line bg-canvas text-ink hover:border-ink/30'
                        }`}>
                        {on && <CheckIcon className="h-4 w-4" />}
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-caption font-semibold text-meta">Line note</label>
              <input
                type="text"
                value={modDraft.note}
                onChange={(e) => setModDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="e.g. extra chilli, no onion"
                className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2">
              <span className="text-sm font-semibold text-ink">Quantity</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Fewer"
                  onClick={() => setModDraft((d) => ({ ...d, qty: Math.max(1, d.qty - 1) }))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-mono text-xl font-extrabold text-ink">{modDraft.qty}</span>
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => setModDraft((d) => ({ ...d, qty: d.qty + 1 }))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function MenuTile({ item, qty, index, onAdd }) {
  return (
    <button
      type="button"
      aria-pressed={qty > 0}
      disabled={!item.available}
      onClick={onAdd}
      className={`group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface text-left transition-all duration-150 ease-soft hover:-translate-y-0.5 hover:border-ink/30 hover:bg-canvas hover:shadow-pop ${
        item.available ? 'cursor-pointer' : 'opacity-50'
      }`}>
      {index != null && item.available && (
        <span className="absolute left-2.5 top-2.5 z-10 flex h-6 min-w-[22px] items-center justify-center rounded-md border border-line bg-surface/95 px-1 font-mono text-caption font-bold text-meta">
          {index}
        </span>
      )}
      {qty > 0 && (
        <span className="absolute right-2.5 top-2.5 z-10 flex h-6 min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 font-mono text-caption font-bold text-white">
          {qty}
        </span>
      )}
      {item.photo ? (
        <img src={item.photo} alt={item.name} className="h-20 w-full object-cover" />
      ) : (
        <div className="h-12 w-full bg-canvas" />
      )}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-bold leading-tight text-ink">{item.name}</h3>
        {item.variants && <p className="mt-0.5 truncate text-caption text-meta">{item.variants}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="font-mono text-sm font-extrabold text-ink">{item.price}</span>
          {!item.available ? (
            <Pill tone="red">86'd</Pill>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-green text-status-green transition-transform duration-150 ease-soft group-hover:scale-110">
              <PlusIcon className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}