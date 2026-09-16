import { useState } from 'react';
import { MegaphoneIcon, MinusIcon, PlusIcon, SearchIcon, ShoppingBagIcon, XIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { Dialog } from './ui/Dialog';
import { EmptyState } from './ui/EmptyState';
import { useToast } from './ui/Toast';
import { useMenu } from '../state/MenuContext';
import { useSettings } from '../state/SettingsContext';
import { campaignPhase, phaseWindow, phaseNext } from '../state/CampaignContext';

const toNum = (price) => Number(String(price).replace(/\D/g, ''));
const fmt = (n) => `Rs ${n.toLocaleString('en-IN')}`;

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

/**
 * Overlay used for the phone-frame preview only — the dialog stays clipped
 * inside the mobile frame instead of escaping as a full-page modal. The panel
 * is centered in the middle of the frame and the frame behind it is locked
 * (not draggable) while the overlay is open.
 */
function FrameOverlay({ onClose, title, children, footer }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-center bg-ink/30">
      <button
        type="button"
        aria-label="Close overlay"
        onClick={onClose}
        className="absolute inset-0 touch-none"
        style={{ touchAction: 'none' }}
      />
      <div
        role="dialog"
        aria-label={title?.heading || 'Dialog'}
        className="relative m-3 w-full max-w-sm self-center overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        {title &&
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-ink">{title.heading}</h3>
              {title.sub && <p className="mt-0.5 text-xs text-meta">{title.sub}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink">
              <XIcon className="h-4 w-4" />
            </button>
          </header>
        }
        <div className="scroll-thin max-h-80 overflow-y-auto px-4 py-3">{children}</div>
        {footer &&
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        }
      </div>
    </div>
  );
}

/**
 * The customer-facing ordering view — the same UI customers get on the online
 * store, embeddable in a phone frame (preview) or full-page (register).
 * Accents, photo and allergen toggles follow the Online Store theme settings.
 */
export function CustomerStore({ accent, storefrontOpen, showPhotos, showAllergens = false, table = '', onOrderPlaced, campaign = null, containDialogs = false }) {
  const { settings, storefront } = useSettings();
  // When the parent doesn't pass explicit values (customer register, tablet and
  // phone frames), fall back to the owner's live storefront config so changes
  // made in Online Store / Settings show up in the customer view.
  const sf = storefront || {};
  const effectiveAccent = accent ?? sf.accent ?? null;
  const effectiveStorefrontOpen = storefrontOpen ?? sf.open ?? true;
  const effectiveShowPhotos = showPhotos ?? sf.showPhotos ?? true;
  const effectiveShowAllergens = showAllergens ?? sf.showAllergens ?? false;
  const { items: menuItems, categories } = useMenu();
  const toast = useToast();

  const [category, setCategory] = useState('All items');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const phase = campaignPhase(campaign);
  const campaignLive = campaign && phase !== 'hidden';
  const phaseName = phase.charAt(0).toUpperCase() + phase.slice(1);
  const campWindow = phaseWindow(campaign, phase);
  const phaseNote = phaseNext(campaign, phase);
  const promotedDish = campaign?.dish ? menuItems.find((i) => i.name === campaign.dish) : null;

  const campaignActLabel = phase === 'preview'
    ? 'Preview'
    : phase === 'preorder'
      ? (promotedDish ? `Pre-order ${promotedDish.name.split(' ')[0]} · 15% off` : 'Pre-order · 15% off')
      : (promotedDish ? `Order ${promotedDish.name.split(' ')[0]}` : 'Order');

  const handleCampaignCta = () => {
    if (!campaign) return;
    if (phase === 'preview') {
      setCampaignOpen(true);
    } else if (phase === 'preorder') {
      if (promotedDish) {
        add(promotedDish);
        toast(`${promotedDish.name} pre-ordered · 15% off applied`, { tone: 'green' });
      } else {
        toast('Pre-order reserved · 15% off at pickup', { tone: 'green' });
      }
    } else if (phase === 'order') {
      if (promotedDish) {
        add(promotedDish);
        toast(`${promotedDish.name} added to order`, { tone: 'green' });
      } else {
        toast('Regular menu ordering', { tone: 'neutral' });
      }
    }
  };

  const catKeys = categories.length > 0 ? categories : ['All items'];

  const items = menuItems.filter((i) => {
    const inCat = category === 'All items' || i.category === category;
    const inQuery = !query.trim() || i.name.toLowerCase().includes(query.toLowerCase());
    return inCat && inQuery;
  });

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + l.qty * toNum(l.price), 0);
  const qtyOf = (name) => cart.find((l) => l.name === name)?.qty ?? 0;

  const add = (item) =>
    setCart((c) => {
      const e = c.find((l) => l.name === item.name);
      if (e) return c.map((l) => (l.name === item.name ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { id: item.id || '', name: item.name, price: toNum(item.price), category: item.category, qty: 1 }];
    });

  const inc = (name) => setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty + 1 } : l)));
  const dec = (name) =>
    setCart((c) => c.map((l) => (l.name === name ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0));

  const placeOrder = () => {
    toast(
      table
        ? `Order received for Table ${table} · ${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}`
        : `Order received · ${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}`,
      { tone: 'green' }
    );
    onOrderPlaced?.(cart.map((l) => ({ ...l })), subtotal, { table });
    setCart([]);
    setCartOpen(false);
  };

  const cartLines = cart.map((l) => (
    <div key={l.name} className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{l.name}</p>
        <p className="font-mono text-xs text-meta">{fmt(l.price)} each</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Fewer ${l.name}`}
          onClick={() => dec(l.name)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
          <MinusIcon className="h-4 w-4" />
        </button>
        <span className="w-4 text-center text-sm font-bold text-ink">{l.qty}</span>
        <button
          type="button"
          aria-label={`More ${l.name}`}
          onClick={() => inc(l.name)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-ink/30">
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <span className="w-16 text-right font-mono text-sm font-bold text-ink">
        {fmt(l.price * l.qty)}
      </span>
    </div>
  ));

  const campaignBody = campaignLive ? (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink/20 bg-ink p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
          {phaseName} · {campaign.channel}
        </p>
        <p className="mt-1 text-xl font-extrabold">
          {campaign.dish ? `${campaign.dish}${promotedDish ? ` · ${promotedDish.price}` : ''}` : campaign.name}
        </p>
        <p className="mt-1 text-xs text-white/60">
          {campWindow || 'No dates set'} · pre-orders {phase === 'preview' ? 'open on launch' : phase === 'preorder' ? 'open now' : 'available now'}
        </p>
      </div>
      {campaign.message && <p className="text-sm text-meta">{campaign.message}</p>}
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
        {campaign.dish && (
          <li className="flex justify-between">
            <span className="text-meta">Featured dish</span>
            <span className="font-semibold">{campaign.dish}</span>
          </li>
        )}
        <li className="flex justify-between">
          <span className="text-meta">Channel</span>
          <span className="font-semibold">{campaign.channel}</span>
        </li>
      </ul>
    </div>
  ) : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-ink">{settings.businessName}</p>
          {table ? (
            <p className="text-xs text-meta">
              Dining at <span className="font-bold text-ink">Table {table}</span> · your order goes to that table
            </p>
          ) : (
            <p className="text-xs text-meta">{settings.city} · 20 min delivery</p>
          )}
        </div>
        <Pill tone={effectiveStorefrontOpen ? 'green' : 'red'} dot>
          {effectiveStorefrontOpen ? 'Open' : 'Closed'}
        </Pill>
      </div>

      {campaignLive &&
      <section
          onClick={() => setCampaignOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`Campaign banner: ${campaign.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCampaignOpen(true); } }}
          className="relative mt-3 cursor-pointer overflow-hidden rounded-xl bg-ink p-3 text-white transition-opacity duration-150 ease-soft hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-status-amber">
              <MegaphoneIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                Marketing · {campaign.channel}
              </p>
              <p className="mt-0.5 truncate text-[13px] font-extrabold">
                {campaign.dish ? `${campaign.dish} — ${campaign.name}` : campaign.name}
              </p>
              <p className="truncate text-[11px] text-white/60">
                {phaseName}
                {campaign.dish && phase === 'preorder' && <> · 15% off pre-orders</>}
                {campWindow && <> · {campWindow}</>}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
              {phase === 'preview' ? 'Preview' : phase === 'preorder' ? 'Pre-order' : 'Order'}
            </span>
          </div>
        </section>
      }

      <div className="relative mt-2">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          aria-label="Search menu"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
      </div>

      <div className="scroll-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {catKeys.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
              }`}>
              {c}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2.5 pb-20">
        {items.length === 0 && (
          <EmptyState
            compact
            icon={<SearchIcon className="h-6 w-6" />}
            title="Nothing matches"
            description="Try another category or search term."
          />
        )}
        {items.map((item) => (
          <div
            key={item.name}
            className={`flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 ${!item.available ? 'opacity-50' : ''}`}>
            {effectiveShowPhotos && item.photo ? (
              <img src={item.photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-bold text-meta ring-1 ring-line">
                {item.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{item.name}</p>
              <p className="font-mono text-xs text-meta">{item.price}</p>
              {!item.available && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-status-red">
                  Sold out
                </p>
              )}
              {item.available && effectiveShowAllergens && allergenNotes[item.name] && (
                <p className="mt-0.5 text-[10px] font-medium text-status-amber">
                  {allergenNotes[item.name]}
                </p>
              )}
            </div>
            {!item.available ? (
              <Pill tone="red">86'd</Pill>
            ) : qtyOf(item.name) > 0 ? (
              <div className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-canvas p-1">
                <button
                  type="button"
                  aria-label={`Fewer ${item.name}`}
                  onClick={() => dec(item.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors duration-150 ease-soft hover:bg-line/60">
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="w-4 text-center text-sm font-bold text-ink">{qtyOf(item.name)}</span>
                <button
                  type="button"
                  aria-label={`More ${item.name}`}
                  onClick={() => inc(item.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink transition-colors duration-150 ease-soft hover:bg-line/60">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Add ${item.name}`}
                onClick={() => {
                  add(item);
                  toast(`${item.name} added`, { tone: 'green' });
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors duration-150 ease-soft hover:opacity-90"
                style={effectiveAccent ? { backgroundColor: effectiveAccent } : undefined}>
                <PlusIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {count > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-auto bg-canvas/95 pb-2 pt-2 backdrop-blur">
          <button
            type="button"
            aria-label="View cart"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity duration-150 ease-soft hover:opacity-90"
            style={effectiveAccent ? { backgroundColor: effectiveAccent } : undefined}>
            <span className="flex items-center gap-2">
              <ShoppingBagIcon className="h-4 w-4" />
              {count} item{count === 1 ? '' : 's'}
            </span>
            <span>{fmt(subtotal)}</span>
          </button>
        </div>
      )}

      {containDialogs
        ? (cartOpen && (
            <FrameOverlay
              onClose={() => setCartOpen(false)}
              title={{ heading: 'Your order', sub: `${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}` }}
              footer={
                <div className="flex w-full items-center gap-2">
                  <Button variant="outline" onClick={() => setCartOpen(false)}>
                    Keep browsing
                  </Button>
                  <Button
                    variant="green"
                    full
                    onClick={placeOrder}
                    disabled={count === 0}>
                    Request order
                  </Button>
                </div>
              }>
              <div className="space-y-2">{cartLines}</div>
            </FrameOverlay>
          ))
        : (
            <Dialog
              open={cartOpen}
              onClose={() => setCartOpen(false)}
              title="Your order"
              subtitle={`${count} item${count === 1 ? '' : 's'} · ${fmt(subtotal)}`}
              width="max-w-md"
              footer={
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setCartOpen(false)}>
                    Keep browsing
                  </Button>
                  <Button
                    variant="green"
                    full
                    onClick={placeOrder}
                    disabled={count === 0}>
                    Request order
                  </Button>
                </div>
              }>
              <div className="space-y-2">{cartLines}</div>
            </Dialog>
          )}

      {campaignLive && containDialogs && campaignOpen && (
        <FrameOverlay
          onClose={() => setCampaignOpen(false)}
          title={{
            heading: phase === 'preview' ? 'Campaign preview' : 'Campaign info',
            sub: phase === 'preview' ? 'Not live yet — pre-orders open on launch' : 'This is what guests see in the store'
          }}
          footer={
            <div className="flex w-full gap-2">
              <Button variant="outline" onClick={() => setCampaignOpen(false)}>
                Close
              </Button>
              {phase !== 'preview' &&
              <Button
                  variant="dark"
                  full
                  onClick={() => { handleCampaignCta(); setCampaignOpen(false); }}>
                  {campaignActLabel}
                </Button>
              }
            </div>
          }>
          {campaignBody}
        </FrameOverlay>
      )}
      {campaignLive && !containDialogs && (
        <Dialog
          open={campaignOpen}
          onClose={() => setCampaignOpen(false)}
          title={phase === 'preview' ? 'Campaign preview' : 'Campaign info'}
          subtitle={phase === 'preview' ? 'Not live yet — pre-orders open on launch' : 'This is what guests see in the store'}
          width="max-w-md"
          footer={
            <div className="flex w-full gap-2">
              <Button variant="outline" onClick={() => setCampaignOpen(false)}>
                Close
              </Button>
              {phase !== 'preview' &&
              <Button
                  variant="dark"
                  full
                  onClick={() => { handleCampaignCta(); setCampaignOpen(false); }}>
                  {campaignActLabel}
                </Button>
              }
            </div>
          }>
          {campaignBody}
        </Dialog>
      )}
    </div>
  );
}
