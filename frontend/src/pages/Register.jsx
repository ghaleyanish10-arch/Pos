import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckIcon, InfoIcon, MegaphoneIcon, MinusIcon, PlusIcon, ShoppingCartIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertBanner } from '../components/ui/AlertBanner';
import { useToast } from '../components/ui/Toast';
import { useOrders } from '../state/OrderContext';
import { useTables } from '../state/TableContext';
import { useMenu } from '../state/MenuContext';
import { api } from '../api/client';
import { recipeFor } from '../data/recipes';
import { inventory } from '../data/manage';
import { useCampaigns, campaignPhase, phaseWindow, phaseNext } from '../state/CampaignContext';

const catDot = {
  'All items': 'bg-meta',
  'Momo & Snacks': 'bg-status-green',
  Mains: 'bg-status-blue',
  Grill: 'bg-status-amber',
  Bar: 'bg-status-purple',
  Dessert: 'bg-status-red'
};

const toNumber = (price) => Number(price.replace(/\D/g, ''));
const fmt = (n) => 'Rs ' + n.toLocaleString('en-IN');

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

function readOrderNotes() {
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

export function Register() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table');
  const toast = useToast();
  const { addOrder } = useOrders();
  const { occupyTable, markOrdered, freeTable } = useTables();
  const { items: menuItems, categories: categoriesList } = useMenu();
  const [category, setCategory] = useState('All items');
  const [cart, setCart] = useState(readCart);
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('Cash');
  const [orderNotes, setOrderNotes] = useState(readOrderNotes);
  const [orderType, setOrderType] = useState(readOrderType);
  const [orderTable, setOrderTable] = useState(() => readOrderTable() || tableParam || '');
  const [recipe, setRecipe] = useState(null);
  const [previewCampaign, setPreviewCampaign] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* storage unavailable */
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_notes', orderNotes);
    } catch {
      /* storage unavailable */
    }
  }, [orderNotes]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_type', orderType);
    } catch {
      /* storage unavailable */
    }
  }, [orderType]);

  useEffect(() => {
    try {
      localStorage.setItem('mesa_register_table', orderTable);
    } catch {
      /* storage unavailable */
    }
  }, [orderTable]);

  // A scan of the table QR landed on the register — the table is occupied from
  // that moment, and every order placed here is named after that table.
  useEffect(() => {
    if (tableParam) occupyTable(tableParam);
  }, [tableParam, occupyTable]);

  const { campaignList } = useCampaigns();
  const campaign = campaignList.find((c) => c.status === 'Scheduled');
  const phase = campaignPhase(campaign);

  const scrollToCurrentOrder = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    const el = document.getElementById('current-order');
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  };

  const handleCampaignCta = () => {
    if (!campaign) return;
    if (phase === 'preview') {
      setPreviewCampaign(campaign);
    } else if (phase === 'preorder') {
      if (promotedDish) {
        add(promotedDish);
        toast(`${promotedDish.name} pre-ordered · 15% off applied`, { tone: 'green' });
      } else {
        toast('Pre-order reserved · 15% off at pickup', { tone: 'green' });
      }
      scrollToCurrentOrder();
    } else if (promotedDish) {
      add(promotedDish);
      toast(`${promotedDish.name} added to the order`, { tone: 'green' });
    } else {
      toast(`${campaign.name} — regular menu ordering`, { tone: 'neutral' });
    }
  };

  const catKeys = categoriesList.length > 0 ? categoriesList : ['All items'];

  const items =
    category === 'All items'
      ? menuItems
      : menuItems.filter((i) => i.category === category);

  const promotedDish = campaign?.dish ? items.find((i) => i.name === campaign.dish) : null;
  const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1);
  const phaseNote = phaseNext(campaign, phase);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.qty * l.price, 0),
    [cart]
  );
  const vat = Math.round(subtotal * 0.13);
  const total = subtotal + vat;
  const qtyOf = (name) => (cart.find((l) => l.name === name)?.qty ?? 0);

  const orderTypeLabel = orderType.charAt(0).toUpperCase() + orderType.slice(1);

  const add = (item, message) => {
    setCart((c) => {
      const existing = c.find((l) => l.name === item.name);
      if (existing) {
        return c.map((l) => (l.name === item.name ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...c,
        { id: item.id || '', name: item.name, price: toNumber(item.price), category: item.category, qty: 1 }
      ];
    });
    if (message) toast(message, { tone: 'green' });
  };

  const inc = (name) =>
    setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty + 1 } : l)));

  const dec = (name) =>
    setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0));

  const clearCart = () => setCart([]);

  const confirmPayment = async () => {
    const paid = fmt(total);
    const paidTable = orderTable || tableParam || '';
    if (paidTable) markOrdered(paidTable);
    let fallback = false;
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          type: orderType,
          table_id: orderTable || tableParam || '',
          guest_id: '',
          items: cart.map((l, i) => ({
            menu_item_id: l.id,
            name: l.name,
            qty: l.qty,
            price: l.price,
            notes: (i === 0 && orderNotes.trim()) ? orderNotes.trim() : ''
          }))
        }
      });
      await api('/transactions', {
        method: 'POST',
        body: { order_id: order.id, method: payMethod.toLowerCase(), amount: total, ref: '' }
      });
      const ref = `#${String(order.id).slice(0, 5).toUpperCase()}`;
      setPayOpen(false);
      setPayMethod('Cash');
      setOrderNotes('');
      clearCart();
      if (paidTable) freeTable(paidTable);
      toast.success(`Paid ${paid} · ${payMethod} · Order ${ref} sent to kitchen${paidTable ? ` · Table ${paidTable} open` : ''}`);
      return;
    } catch {
      fallback = true;
    }

const ticket = addOrder(cart, payMethod, { notes: orderNotes, allergy: orderNotes, type: orderType, table: orderTable || tableParam || '—' });
      setPayOpen(false);
      setPayMethod('Cash');
      setOrderNotes('');
      clearCart();
    if (fallback) {
      if (paidTable) freeTable(paidTable);
      if (ticket) {
        toast.success(`Paid ${paid} · ${payMethod} · Ticket ${ticket.id} recorded offline${paidTable ? ` · Table ${paidTable} open` : ''}`);
      } else {
        toast.success(`Paid ${paid} · ${payMethod} · Register 1`);
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Register"
        descriptor="Register 1 · Riya on shift · Dine-in · Service open"
        />

      {tableParam &&
      <div className="mb-5">
          <AlertBanner>
            Scanned from table <span className="font-bold">{tableParam}</span> — marked occupied on the floor plan; this order will be named and routed to that table.
          </AlertBanner>
        </div>
      }

      {campaign && phase !== 'hidden' &&
      <section
          onClick={() => setPreviewCampaign(campaign)}
          role="button"
          tabIndex={0}
          aria-label={`Campaign info: ${campaign.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewCampaign(campaign); } }}
          className="mb-5 cursor-pointer overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-150 ease-soft hover:shadow-pop focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
          <div className="flex flex-wrap items-center gap-4 bg-ink px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-status-amber">
              <MegaphoneIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                Marketing · {campaign.channel}
              </p>
              <p className="mt-0.5 truncate text-base font-extrabold text-white">
                {campaign.dish ? `${campaign.dish} — ${campaign.name}` : campaign.name}
              </p>
              <p className="truncate text-xs text-white/60">
                {phaseName}
                {campaign.dish && phase === 'preorder' && <> · 15% off pre-orders</>}
                {phaseWindow(campaign, phase) && <> · {phaseWindow(campaign, phase)}</>}
                {phaseNote && <> · auto: {phaseNote}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 sm:flex">
                <InfoIcon className="h-3.5 w-3.5" />
                Details
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleCampaignCta(); }}>
                {phase === 'preview' ? 'Preview' :
                 phase === 'preorder' ? (promotedDish ? `Pre-order ${promotedDish.name.split(' ')[0]} · 15% off` : 'Pre-order · 15% off') :
                 promotedDish ? `Order ${promotedDish.name.split(' ')[0]}` : 'Order'}
              </Button>
            </div>
          </div>
        </section>
      }

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="scroll-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {catKeys.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c)}
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-150 ease-soft ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                  }`}>
                  <span className={`h-2 w-2 rounded-full ${catDot[c]}`} aria-hidden="true" />
                  {c}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => {
              const inCart = qtyOf(item.name) > 0;
              return (
                <div
                  key={item.name}
                  role="button"
                  tabIndex={item.available ? 0 : -1}
                  aria-pressed={inCart}
                  aria-disabled={!item.available}
                  onClick={() => { if (item.available) add(item, `${item.name} added · qty ${qtyOf(item.name) + 1}`); }}
                  onKeyDown={(e) => { if (item.available && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); add(item, `${item.name} added · qty ${qtyOf(item.name) + 1}`); } }}
                  className={`group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface text-left transition-all duration-150 ease-soft hover:-translate-y-0.5 hover:border-ink/30 hover:bg-canvas hover:shadow-pop ${item.available ? 'cursor-pointer' : 'opacity-50'}`}>
                  <div className="relative">
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt={item.name}
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="h-14 w-full bg-canvas" />
                    )}
                    {recipeFor(item.name) && (
                      <button
                        type="button"
                        aria-label={`Ingredients for ${item.name}`}
                        onClick={(e) => { e.stopPropagation(); setRecipe(item); }}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/95 text-meta shadow transition-colors duration-150 ease-soft hover:text-ink focus:outline-none">
                        <InfoIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[15px] font-bold leading-tight text-ink">
                        {item.name}
                      </h3>
                      {inCart && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-ink px-1.5 font-mono text-[11px] font-bold text-white">
                          {qtyOf(item.name)}
                        </span>
                      )}
                    </div>
                    {item.variants && (
                      <p className="mt-0.5 text-[11px] text-meta">{item.variants}</p>
                    )}

                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <span className="font-mono text-base font-extrabold text-ink">
                        {item.price}
                      </span>
                      {!item.available ? (
                        <Pill tone="red">86'd</Pill>
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-green text-status-green transition-transform duration-150 ease-soft group-hover:scale-110">
                          <PlusIcon className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div id="current-order" className="flex max-h-[calc(100vh-8rem)] scroll-mt-24 flex-col self-start rounded-card border border-line bg-surface p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-ink">Current order</h2>
              <p className="text-sm text-meta">
                {cart.length === 0
                  ? 'No items yet'
                  : `${cart.length} line${cart.length > 1 ? 's' : ''} · ${cart.reduce((s, l) => s + l.qty, 0)} items`}
                {orderTable && ` · Table ${orderTable}`}
              </p>
            </div>
            <Button variant="quiet" size="sm" onClick={clearCart} disabled={cart.length === 0}>
              Clear
            </Button>
          </div>

          <div className="flex items-center gap-1.5 border-b border-line pb-3">
            {['Dine-in', 'Takeaway', 'Delivery'].map((t) => {
            const active = t.toLowerCase() === orderType;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => setOrderType(t.toLowerCase())}
                className={`flex h-8 flex-1 items-center justify-center rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                active ?
                'border-ink bg-ink text-white' :
                'border-line bg-canvas text-meta hover:text-ink'}`
                }>
                
                {t}
              </button>);

            })}
          </div>

          <div className="mt-3 border-b border-line pb-3">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Table number
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={orderTable}
                onChange={(e) => setOrderTable(e.target.value.replace(/[^0-9a-zA-Z\- ]/g, '').slice(0, 8))}
                placeholder={tableParam ? `Table ${tableParam}` : 'e.g. T4'}
                aria-label="Table number"
                className="h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
              {orderTable && (
                <button
                  type="button"
                  aria-label="Clear table number"
                  onClick={() => setOrderTable('')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-meta transition-colors duration-150 ease-soft hover:text-ink">
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto py-4">
            {cart.length === 0 ? (
              <EmptyState
                compact
                icon={<ShoppingCartIcon className="h-6 w-6" />}
                title="Cart is empty"
                description="Tap an item on the left to add it to this order."
              />
            ) : (
              cart.map((l) => (
                <div
                  key={l.name}
                  className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{l.name}</p>
                    <p className="font-mono text-[11px] text-meta">Rs {l.price} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Fewer ${l.name}`}
                      onClick={() => dec(l.name)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center font-mono text-sm font-extrabold text-ink">
                      {l.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`More ${l.name}`}
                      onClick={() => inc(l.name)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-sm font-bold text-ink">
                    {fmt(l.qty * l.price)}
                  </span>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 &&
          <div className="border-t border-line pt-3 pb-1">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Notes / allergy
              </label>
              <textarea
                rows={2}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Allergy: peanuts · no coriander"
                className="mt-1 w-full rounded-xl border border-line bg-canvas p-2.5 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
            </div>
          }

          <div className="border-t border-line pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-meta">Subtotal</span>
              <span className="font-mono font-semibold text-ink">{fmt(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-meta">VAT (13%)</span>
              <span className="font-mono font-semibold text-ink">{fmt(vat)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2.5">
              <span className="text-base font-extrabold text-ink">Total</span>
              <span className="font-mono text-2xl font-extrabold tracking-tight text-ink">
                {fmt(total)}
              </span>
            </div>

            <Button
              variant="dark"
              full
              disabled={cart.length === 0}
              onClick={() => {
                setPayMethod('Cash');
                setPayOpen(true);
              }}
              className="mt-4 h-14 text-base">
              Charge {fmt(total)}
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Collect payment"
        subtitle={`${orderTypeLabel}${orderTable ? ` · Table ${orderTable}` : ''} · ${cart.length} lines · ${fmt(total)} due`}
        width="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button variant="dark" full onClick={confirmPayment}>
              Pay {fmt(total)}
            </Button>
          </>
        }>
        <div className="space-y-4">
          <div className="rounded-xl bg-canvas p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Total due
            </p>
            <span className="font-mono text-3xl font-extrabold text-ink">{fmt(total)}</span>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Payment method
            </p>
            <div className="grid grid-cols-3 gap-2">
              {['Cash', 'Card', 'QR/Wallet'].map((m) => {
                const active = payMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPayMethod(m)}
                    className={`h-14 rounded-xl border px-3 text-sm font-semibold transition-colors duration-150 ease-soft ${
                      active
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-canvas text-meta hover:text-ink'
                    }`}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-status-green/25 bg-tint-green px-3 py-2.5 text-xs font-semibold text-status-green">
            <CheckIcon className="h-4 w-4 shrink-0" />
            {payMethod} tends until confirmed — confirm on the payment screen.
          </div>
        </div>
      </Dialog>

      {recipe && (() => {
        const rec = recipeFor(recipe.name);
        if (!rec) return null;
        const serveCost = rec.lines.reduce((s, l) => s + parseFloat(l.qty) * l.unitCost, 0);
        const lowLines = rec.lines.filter((l) => {
          const inv = inventory.find((i) => i.name === l.ingredient);
          return inv && inv.stock <= inv.threshold;
        });
        return (
          <Dialog
            open
            onClose={() => setRecipe(null)}
            title={recipe.name}
            subtitle={`${recipe.price} · ${rec.serves}`}
            width="max-w-md"
            footer={
              <>
                <Button variant="outline" onClick={() => setRecipe(null)}>
                  Close
                </Button>
                <Button
                  variant="dark"
                  full
                  onClick={() => {
                    if (recipe.available) add(recipe);
                    setRecipe(null);
                  }}>
                  Add to order
                </Button>
              </>
            }>
            <div className="space-y-4">
              {lowLines.length > 0 && (
                <AlertBanner>
                  Low stock — {lowLines.map((l) => l.ingredient).join(', ')}
                </AlertBanner>
              )}

              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Ingredients
                  </p>
                  <span className="font-mono text-xs font-bold text-ink">
                    Rs {serveCost.toLocaleString('en-IN')} / serving
                  </span>
                </div>
                <ul className="divide-y divide-line rounded-xl border border-line bg-canvas">
                  {rec.lines.map((l) => {
                    const inv = inventory.find((i) => i.name === l.ingredient);
                    const isLow = inv && inv.stock <= inv.threshold;
                    return (
                      <li
                        key={`${l.ingredient}-${l.qty}`}
                        className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <span className="min-w-0 text-sm font-medium text-ink">
                          {l.ingredient}
                          {isLow && (
                            <span className="ml-2 rounded-full bg-tint-amber px-1.5 py-0.5 font-mono text-[10px] font-bold text-status-amber">LOW</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-meta">
                          {l.qty} · Rs {l.unitCost}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {rec.notes && (
                <p className="text-xs text-meta">{rec.notes}</p>
              )}
            </div>
          </Dialog>
        );
      })()}

      {previewCampaign && (() => {
        const pc = previewCampaign;
        const pcPhase = campaignPhase(pc);
        const isPreview = pcPhase === 'preview';
        const actLabel = isPreview
          ? 'Preview on register'
          : pcPhase === 'preorder'
            ? (promotedDish ? `Pre-order ${promotedDish.name.split(' ')[0]} · 15% off` : 'Pre-order · 15% off')
            : 'Add to order';
        const dishPrice = pc.dish ? items.find((i) => i.name === pc.dish)?.price : null;
        return (
          <Dialog
            open
            onClose={() => setPreviewCampaign(null)}
            title={isPreview ? 'Campaign preview' : 'Campaign info'}
            subtitle={isPreview ? 'Not live yet — the register CTA switches to Pre-order on launch' : 'This is what guests see in the register'}
            width="max-w-md"
            footer={
              <div className="flex w-full gap-2">
                <Button variant="outline" onClick={() => setPreviewCampaign(null)}>
                  Close
                </Button>
                {!isPreview &&
                <Button
                  variant="dark"
                  full
                  onClick={() => { handleCampaignCta(); setPreviewCampaign(null); }}>
                  {actLabel}
                </Button>
                }
              </div>
            }>
            <div className="space-y-4">
              <div className="rounded-2xl border border-ink/20 bg-ink p-5 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                  {phaseName} · {pc.channel}
                </p>
                <p className="mt-1 text-xl font-extrabold">
                  {pc.dish ? `${pc.dish}${dishPrice ? ` · Rs ${Number(dishPrice.replace(/\D/g, '')).toLocaleString('en-IN')}` : ''}` : pc.name}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {phaseWindow(pc, pcPhase) || 'No dates set'} · pre-orders {pcPhase === 'preview' ? 'open on launch' : pcPhase === 'preorder' ? 'open now' : 'available now'}
                </p>
              </div>
              {pc.message && <p className="text-sm text-meta">{pc.message}</p>}
              <ul className="space-y-1.5 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
                <li className="flex justify-between">
                  <span className="text-meta">Offer</span>
                  <span className="font-semibold">15% off pre-orders</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-meta">Phase</span>
                  <span className="font-semibold">{phaseName}</span>
                </li>
                {phaseNote && (
                  <li className="flex justify-between">
                    <span className="text-meta">Next</span>
                    <span className="font-semibold">{phaseNote}</span>
                  </li>
                )}
                {pc.dish && (
                  <li className="flex justify-between">
                    <span className="text-meta">Featured dish</span>
                    <span className="font-semibold">{pc.dish}</span>
                  </li>
                )}
                <li className="flex justify-between">
                  <span className="text-meta">Channel</span>
                  <span className="font-semibold">{pc.channel}</span>
                </li>
              </ul>
            </div>
          </Dialog>
        );
      })()}
    </div>
  );
}