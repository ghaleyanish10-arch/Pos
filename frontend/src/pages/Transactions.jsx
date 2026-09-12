import { useMemo, useState } from 'react';
import { BanknoteIcon, CalendarIcon, CreditCardIcon, QrCodeIcon, ReceiptIcon, SearchXIcon } from
'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { FilterChips, SearchInput } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { StatRow } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { useToast } from '../components/ui/Toast';
import { transactions } from '../data/sell';

const methodIcon = {
  Cash: <BanknoteIcon className="h-4 w-4 text-meta" />,
  Card: <CreditCardIcon className="h-4 w-4 text-meta" />,
  'QR/Wallet': <QrCodeIcon className="h-4 w-4 text-meta" />
};

const statusTone = {
  Success: 'green',
  Refunded: 'red',
  Failed: 'red'
};

const statusTint = {
  Refunded: 'bg-tint-red/40',
  Failed: 'bg-tint-red/50'
};

const linePool = [
  { name: 'Steam Chicken Momo', qty: 2, price: 280 },
  { name: 'Thakali Set', qty: 1, price: 620 },
  { name: 'Buff Sekuwa Platter', qty: 1, price: 680 },
  { name: 'Veg Jhol Momo', qty: 1, price: 260 },
  { name: 'Mango Lassi', qty: 2, price: 180 },
  { name: 'Chicken Chowmein', qty: 2, price: 320 }
];

function breakdownFor(t) {
  const amount = parseInt(t.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const pick = parseInt(t.id.replace(/[^0-9]/g, '').slice(-2), 10) || 0;
  const lines = [];
  let remaining = amount;
  const indexes = [pick % 6, (pick + 2) % 6, (pick + 4) % 6];
  for (const i of indexes) {
    const item = linePool[i];
    const cost = item.qty * item.price;
    if (cost > remaining) {
      lines.push({ ...item, qty: Math.max(1, Math.round(remaining / item.price)) });
      remaining -= lines[lines.length - 1].qty * item.price;
      break;
    }
    lines.push(item);
    remaining -= cost;
  }
  if (lines.length === 0) lines.push({ name: 'Order total', qty: 1, price: amount });
  return { lines, tax: Math.round(amount * 0.13) };
}

export function Transactions() {
  const [method, setMethod] = useState('All');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const toast = useToast();

  const rows = useMemo(
    () =>
    transactions.filter(
      (t) =>
      (method === 'All' || t.method === method) && (
      t.id.toLowerCase().includes(query.toLowerCase()) ||
      t.ref.toLowerCase().includes(query.toLowerCase()))
    ),
    [method, query]
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Transactions" descriptor="126 today · Rs 1,86,420">
        <Button variant="outline" icon={<CalendarIcon className="h-4 w-4" />}>
          Today · 10 Sep
        </Button>
        <Button variant="outline">Export CSV</Button>
      </PageHeader>

      <div className="sticky top-0 z-10 -mx-1 mb-4 px-1">
        <StatRow
          stats={[
          { label: "Today's total", value: 'Rs 1,86,420', meta: '+8.4% vs last Thu' },
          { label: 'Transactions', value: '126', meta: '3 refunded · 1 failed' },
          { label: 'Average ticket', value: 'Rs 1,479', meta: 'Dine-in Rs 1,860' },
          { label: 'Cash in drawer', value: 'Rs 24,150', meta: 'Last count 12:00' }]
          } />
        
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips
          ariaLabel="Payment method"
          options={['All', 'Cash', 'Card', 'QR/Wallet']}
          value={method}
          onChange={setMethod} />
        
        <SearchInput
          className="ml-auto w-full max-w-[280px]"
          placeholder="Search ID or table"
          value={query}
          onChange={setQuery} />
        
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Transaction</Th>
              <Th>Order ref</Th>
              <Th>Method</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) =>
            <Tr key={t.id} className={statusTint[t.status] || ''} onClick={() => setActive(t)}>
                <Td className="font-mono text-sm text-meta">{t.time}</Td>
                <Td className="font-mono text-sm font-semibold">{t.id}</Td>
                <Td className="text-sm text-meta">{t.ref}</Td>
                <Td>
                  <span className="flex items-center gap-2 text-sm">
                    {methodIcon[t.method]}
                    {t.method}
                  </span>
                </Td>
                <Td className="text-right font-mono text-sm font-bold">{t.amount}</Td>
                <Td>
                  <Pill tone={statusTone[t.status]} dot>
                    {t.status}
                  </Pill>
                </Td>
              </Tr>
            )}
            {rows.length === 0 &&
            <Tr>
                <Td colSpan={6}>
                  <EmptyState
                    compact
                    tone="blue"
                    icon={<SearchXIcon className="h-6 w-6" />}
                    title="No transactions found"
                    description={`Nothing matches "${query}" with the ${method} filter.`}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setQuery(''); setMethod('All'); }}>
                        Clear filters
                      </Button>
                    } />
                </Td>
              </Tr>
            }
          </tbody>
        </Table>
      </TableWrap>

      {active &&
      <DetailDrawer
        open
        onClose={() => setActive(null)}
        title={active.id}
        subtitle={`${active.time} · ${active.ref}`}
        footer={
        <>
            {active.status === 'Success' &&
            <Button variant="green" full onClick={() => { toast('Refund initiated · ' + active.id, { tone: 'dark' }); setActive(null); }}>
                Refund
              </Button>
            }
            <Button variant="dark" full onClick={() => toast('Receipt emailed · ' + active.id, { tone: 'green' })}>
              Email receipt
            </Button>
          </>
        }>

        {(() => {
          const { lines, tax } = breakdownFor(active);
          return (
            <>
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  {methodIcon[active.method]}
                  <span className="font-semibold text-ink">{active.method}</span>
                </div>
                <Pill tone={statusTone[active.status]} dot>{active.status}</Pill>
              </div>

              <dl className="divide-y divide-line">
                <DetailRow label="Time" value={active.time} mono />
                <DetailRow label="Order reference" value={active.ref} />
                <DetailRow label="Amount" value={active.amount} mono tone="green" />
                <DetailRow label="Fiscal ID" value={active.fiscalId} mono />
                <DetailRow label="Certification" value={active.certified} badge={<Pill tone={active.certified === 'Certified' ? 'green' : 'amber'}>{active.certified}</Pill>} />
              </dl>

              <DetailSection title="Items">
                <div className="rounded-xl border border-line bg-canvas">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
                      <span className="min-w-0 truncate text-sm text-ink">{l.name}<span className="text-meta"> × {l.qty}</span></span>
                      <span className="shrink-0 font-mono text-sm font-semibold">Rs {l.qty * l.price}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-xs text-meta">Tax (13%)</span>
                    <span className="font-mono text-xs font-semibold text-meta">Rs {tax}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
                    <span className="text-sm font-bold text-ink">Total</span>
                    <span className="font-mono text-sm font-extrabold text-ink">{active.amount}</span>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="End of day">
                <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm text-meta">
                  <ReceiptIcon className="h-4 w-4" />
                  <span>Fiscal receipt IRD-2026-{active.id.slice(-5)} next in batch B-4</span>
                </div>
              </DetailSection>
            </>
          );
        })()}
      </DetailDrawer>
      }
    </div>);

}
