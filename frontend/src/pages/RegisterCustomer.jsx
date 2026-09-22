import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLinkIcon, SmartphoneIcon, TabletIcon, MonitorIcon, XIcon } from 'lucide-react';
import { CustomerStore } from '../components/CustomerStore';
import { api } from '../api/client';
import { useOrders } from '../state/OrderContext';
import { useTables } from '../state/TableContext';
import { useCampaigns, DEMO_CAMPAIGN } from '../state/CampaignContext';
import { useToast } from '../components/ui/Toast';

const DEVICES = [
  { key: 'desktop', label: 'Desktop', Icon: MonitorIcon, width: null },
  { key: 'tablet', label: 'Tablet', Icon: TabletIcon, width: 768 },
  { key: 'phone', label: 'Phone', Icon: SmartphoneIcon, width: 390 }
];

/**
 * The customer register — the exact ordering view customers see, from the
 * customer's point of view. Shares one implementation with the Online Store
 * phone preview, so what managers preview is what customers use.
 *
 * Scanning a table's QR code lands here with ?table=T4: the table is marked
 * occupied on the floor plan immediately, and every order placed is named
 * after that table.
 */
export function RegisterCustomer() {
  const [params] = useSearchParams();
  const device = params.get('device') || 'desktop';
  const table = (params.get('table') || '').trim();
  // Preview mode (an explicit ?device= is a staff preview from Online Store).
  // A plain visit (QR scan, storefront link) is a real customer: show ONLY the
  // storefront — no device switcher, no "back to the POS" links.
  const isPreview = params.has('device');
  const framed = DEVICES.find((d) => d.key === device)?.width || null;
  const { addTicket } = useOrders();
  const { occupyTable, markOrdered, setTableOrder } = useTables();
  const { campaignList } = useCampaigns();
  // Real customers only see campaigns that are actually scheduled on the
  // server. DEMO_CAMPAIGN is a staff preview aid — it never stands in for a
  // real campaign in front of a paying guest.
  const realCampaign = campaignList.find((c) => c.status === 'Scheduled');
  const campaign = isPreview ? realCampaign || DEMO_CAMPAIGN : realCampaign;
  const toast = useToast();
  const seatedRef = useRef(false);

  // Opening the menu from the table QR = the party has arrived at that table.
  useEffect(() => {
    if (!table || seatedRef.current) return;
    seatedRef.current = true;
    if (occupyTable(table)) {
      toast(`Welcome! You are seated at Table ${table} — the floor plan now shows it as occupied.`, { tone: 'green' });
    }
  }, [table, occupyTable, toast]);

  const handleOrderPlaced = async (lines, _subtotal, meta = {}) => {
    const tableLabel = meta.table || table || '';
    // Persist to the backend so the order shows up in staff Orders/KDS as an
    // incoming ticket (customers have no session, hence the public endpoint).
    let sent = false;
    let rejected = null;
    let created = null;
    try {
      created = await api('/public/orders', {
        method: 'POST',
        body: {
          type: tableLabel ? 'dine-in' : 'takeaway',
          table_id: tableLabel,
          items: (lines || []).map((l) => ({
            menu_item_id: l.id || '',
            name: l.name,
            qty: l.qty,
            price: l.price
          }))
        }
      });
      sent = true;
    } catch (err) {
      if (err && typeof err.status === 'number') {
        // The server actively rejected the order — do not claim it was sent.
        rejected = err.body?.error || err.message || 'the server rejected the order';
      }
    }
    if (tableLabel && sent) {
      // Only refresh the floor when the server actually accepted the order —
      // a rejected order must not seat the table or fake a check.
      markOrdered(tableLabel);
      setTableOrder(tableLabel, {
        ref: created?.id ? `#${String(created.id).slice(0, 5).toUpperCase()}` : ''
      });
    }
    if (sent) {
      addTicket({
        id: undefined, // OrderContext assigns the next ticket id
        type: tableLabel ? 'dine-in' : 'takeaway',
        tag: tableLabel ? `Table ${tableLabel}` : 'Online · customer',
        items: lines.map((l) => `${l.qty}× ${l.name}`),
        elapsed: '0 min',
        station: 'Kitchen',
        payment: tableLabel ? 'Bill to table' : 'Pay on pickup',
        server: 'Customer',
        table: tableLabel || '—',
        notes: tableLabel ? `Placed from Table ${tableLabel} QR` : 'Placed from the customer register'
      });
      toast(
        tableLabel
          ? `Order sent for Table ${tableLabel} · ${lines.length} item${lines.length === 1 ? '' : 's'}`
          : `Order sent to the store · ${lines.length} item${lines.length === 1 ? '' : 's'}`,
        { tone: 'green' }
      );
    } else if (rejected) {
      // Kept locally so the guest still has a record, but the kitchen was
      // not notified and the store never received it — say exactly that.
      toast(`Order could not be sent: ${rejected}`, { tone: 'red' });
    } else {
      // Network failure — the order lives on this device's ticket board.
      addTicket({
        id: undefined,
        type: tableLabel ? 'dine-in' : 'takeaway',
        tag: tableLabel ? `Table ${tableLabel}` : 'Online · customer',
        items: lines.map((l) => `${l.qty}× ${l.name}`),
        elapsed: '0 min',
        station: 'Kitchen',
        payment: tableLabel ? 'Bill to table' : 'Pay on pickup',
        server: 'Customer',
        table: tableLabel || '—',
        notes: tableLabel ? `Kept on this device — store server unreachable` : 'Kept on this device — store server unreachable'
      });
      toast(
        tableLabel
          ? `Store server unreachable — order kept on this device for Table ${tableLabel}`
          : `Store server unreachable — order kept on this device`,
        { tone: 'amber' }
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {isPreview ? (
          <>
            <Link
              to="/online-store"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
              <XIcon className="h-4 w-4" />
              Back to online store
            </Link>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              {DEVICES.map((d) => (
                <Link
                  key={d.key}
                  to={`/register/customer?device=${d.key}${table ? `&table=${encodeURIComponent(table)}` : ''}`}
                  aria-pressed={device === d.key}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                    device === d.key ? 'bg-ink text-white' : 'text-meta hover:text-ink'
                  }`}>
                  <d.Icon className="h-3.5 w-3.5" />
                  {d.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex justify-center">
        {framed ? (
          <div
            className="rounded-[36px] border-[10px] border-ink bg-surface shadow-pop"
            style={{ width: framed }}>
            <div className="flex h-6 items-center justify-center">
              <span className="h-1.5 w-16 rounded-full bg-line" aria-hidden="true" />
            </div>
            <div className="scroll-thin relative max-h-[640px] overflow-y-auto rounded-b-[26px] bg-canvas px-4 pb-4 pt-2">
              <CustomerStore
                table={table}
                onOrderPlaced={handleOrderPlaced}
                campaign={campaign}
                containDialogs
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[560px] rounded-card border border-line bg-canvas p-4">
            <CustomerStore table={table} onOrderPlaced={handleOrderPlaced} campaign={campaign} />
          </div>
        )}
      </div>

      {isPreview && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-meta">
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          This is the customer view — orders placed here arrive at the store like online orders.
        </p>
      )}
    </div>
  );
}
