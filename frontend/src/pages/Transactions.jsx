import { useEffect, useMemo, useState } from 'react';
import { BanknoteIcon, CalendarIcon, CreditCardIcon, QrCodeIcon, ReceiptIcon, SearchXIcon, SendIcon } from
'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { FilterChips, Field, SearchInput, inputClass } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { StatRow } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { Dialog } from '../components/ui/Dialog';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';
import { transactions as mockTransactions } from '../data/sell';

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

const methodLabel = (m) => {
  const s = String(m || '');
  if (/^qr/i.test(s)) return 'QR/Wallet';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const fmtTxAmount = (v) =>
  typeof v === 'number' ? `Rs ${v.toLocaleString('en-IN')}` : String(v ?? '');

const fmtTxTime = (t) => {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t ?? '');
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
};

const txTime = (t) => t.time || t.created_at || '';

const txTable = (t) => t.table_name || '';

const txStatus = (t) => {
  const s = String(t.status || 'Success');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function breakdownFor(t) {
  // API transactions carry their real amount; mock rows carry 'Rs 2,480' strings.
  if (typeof t.amount === 'number' && t.items) {
    return {
      lines: t.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      tax: Math.round(t.amount * 0.13 / 1.13)
    };
  }
  const amount = parseInt(String(t.amount).replace(/[^0-9]/g, ''), 10) || 0;
  const pick = parseInt(String(t.id).replace(/[^0-9]/g, '').slice(-2), 10) || 0;
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
  const [txList, setTxList] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/transactions');
        if (!cancelled) setTxList(res?.data || []);
      } catch {
        if (!cancelled) setTxList(mockTransactions);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allRows = txList || mockTransactions;

  function sendReceiptEmail() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTo.trim())) {
      toast('Enter a valid email address', { tone: 'red' });
      return;
    }
    const to = emailTo.trim();
    const isMock = typeof active?.amount === 'string';
    if (isMock) {
      // Demo data (API offline) — the server has no such transaction; open the mail app.
      window.location.href = mailtoReceipt(active, to);
      setEmailOpen(false);
      return;
    }
    setEmailSending(true);
    api(`/transactions/${active.id}/email`, { method: 'PUT', body: { to } })
      .then((res) => {
        toast(res?.message || `Receipt emailed to ${to}`, { tone: 'green' });
        setEmailOpen(false);
      })
      .catch((e) => {
        if (e?.status === 503) {
          toast('SMTP not configured on the server — opening your mail app instead', { tone: 'amber' });
          window.location.href = mailtoReceipt(active, to);
          setEmailOpen(false);
        } else {
          toast(e?.message || 'Could not send email', { tone: 'red' });
        }
      })
      .finally(() => setEmailSending(false));
  }

  function mailtoReceipt(t, to) {
    const { lines, tax } = breakdownFor(t);
    const body = [
      'Payment receipt',
      `Transaction: ${String(t.id).slice(0, 8).toUpperCase()}`,
      `Order ref: ${t.ref || '—'}`,
      ...(txTable(t) ? [`Table: ${txTable(t)}`] : []),
      '',
      ...lines.map((l) => `- ${l.name} x${l.qty} = Rs ${(l.qty * l.price).toLocaleString('en-IN')}`),
      `Tax (13%): Rs ${tax.toLocaleString('en-IN')}`,
      `Total: ${fmtTxAmount(t.amount)}`,
      '',
      'Mesa OS · Restaurant POS'
    ].join('\n');
    return `mailto:${to}?subject=${encodeURIComponent(`Payment receipt ${String(t.id).slice(0, 8).toUpperCase()} — ${fmtTxAmount(t.amount)}`)}&body=${encodeURIComponent(body)}`;
  }

  const rows = useMemo(
    () =>
    allRows.filter(
      (t) =>
      (method === 'All' || methodLabel(t.method) === method) && (
      String(t.id).toLowerCase().includes(query.toLowerCase()) ||
      String(t.ref || '').toLowerCase().includes(query.toLowerCase()))
    ),
    [allRows, method, query]
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
              <Th>Table</Th>
              <Th>Method</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) =>
            <Tr key={t.id} className={statusTint[txStatus(t)] || ''} onClick={() => setActive(t)}>
                <Td className="font-mono text-sm text-meta">{fmtTxTime(txTime(t))}</Td>
                <Td className="font-mono text-sm font-semibold">{t.id.slice(0, 8).toUpperCase()}</Td>
                <Td className="text-sm text-meta">{t.ref || '—'}</Td>
                <Td className="text-sm">{txTable(t) || '—'}</Td>
                <Td>
                  <span className="flex items-center gap-2 text-sm">
                    {methodIcon[methodLabel(t.method)]}
                    {methodLabel(t.method)}
                  </span>
                </Td>
                <Td className="text-right font-mono text-sm font-bold">{fmtTxAmount(t.amount)}</Td>
                <Td>
                  <Pill tone={statusTone[txStatus(t)] || 'green'} dot>
                    {txStatus(t)}
                  </Pill>
                </Td>
              </Tr>
            )}
            {rows.length === 0 &&
            <Tr>
                <Td colSpan={7}>
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
        subtitle={[txTime(active) && fmtTxTime(txTime(active)), active.ref || null, txTable(active) || null].filter(Boolean).join(' · ') || 'Transaction details'}
        footer={
        <>
            {active.status === 'Success' &&
            <Button variant="green" full onClick={() => { toast('Refund initiated · ' + active.id, { tone: 'dark' }); setActive(null); }}>
                Refund
              </Button>
            }
            <Button
              variant="dark"
              full
              icon={<SendIcon className="h-4 w-4" />}
              onClick={() => {
                setEmailTo('');
                setEmailOpen(true);
              }}>
              Email receipt
            </Button>
          </>
        }>

        {(() => {
          const { lines, tax } = breakdownFor(active);
          const isMock = typeof active.amount === 'string';
          return (
            <>
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  {methodIcon[methodLabel(active.method)]}
                  <span className="font-semibold text-ink">{methodLabel(active.method)}</span>
                </div>
                <Pill tone={statusTone[txStatus(active)] || 'green'} dot>{txStatus(active)}</Pill>
              </div>

              <dl className="divide-y divide-line">
                <DetailRow label="Time" value={txTime(active) ? fmtTxTime(txTime(active)) : '—'} mono />
                <DetailRow label="Order reference" value={active.ref || '—'} />
                <DetailRow label="Table" value={txTable(active) || '—'} />
                <DetailRow label="Amount" value={fmtTxAmount(active.amount)} mono tone="green" />
                {(isMock || active.fiscal_id) && (
                  <DetailRow label="Fiscal ID" value={isMock ? active.fiscalId : active.fiscal_id} mono />
                )}
                {(isMock || active.certified !== undefined) && (
                  <DetailRow
                    label="Certification"
                    value={isMock ? active.certified : active.certified ? 'Certified' : 'Pending'}
                    badge={<Pill tone={(isMock ? active.certified : active.certified ? 'Certified' : 'Pending') === 'Certified' ? 'green' : 'amber'}>{isMock ? active.certified : active.certified ? 'Certified' : 'Pending'}</Pill>} />
                )}
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
                    <span className="font-mono text-xs font-semibold text-meta">Rs {tax.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
                    <span className="text-sm font-bold text-ink">Total</span>
                    <span className="font-mono text-sm font-extrabold text-ink">{fmtTxAmount(active.amount)}</span>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="End of day">
                <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm text-meta">
                  <ReceiptIcon className="h-4 w-4" />
                  <span>Fiscal receipt …{String(active.id).slice(-5)} next in batch B-4</span>
                </div>
              </DetailSection>
            </>
          );
        })()}
      </DetailDrawer>
      }

      {active && (
        <Dialog
          open={emailOpen}
          onClose={() => !emailSending && setEmailOpen(false)}
          title="Email receipt"
          subtitle={`${String(active.id).slice(0, 8).toUpperCase()} · ${fmtTxAmount(active.amount)} · ${methodLabel(active.method)}${txTable(active) ? ` · ${txTable(active)}` : ''}`}
          footer={
            <>
              <Button variant="outline" onClick={() => setEmailOpen(false)} disabled={emailSending}>
                Cancel
              </Button>
              <Button variant="green" onClick={sendReceiptEmail} disabled={emailSending}>
                {emailSending ? 'Sending…' : 'Send receipt'}
              </Button>
            </>
          }>
          <div className="space-y-4">
            <Field label="Send to">
              <input
                className={inputClass}
                type="email"
                placeholder="guest@email.com"
                value={emailTo}
                autoFocus
                onChange={(e) => setEmailTo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendReceiptEmail(); }} />
            </Field>
            <p className="rounded-xl border border-line bg-canvas p-3 text-xs text-meta">
              A real email with the itemised receipt is sent via the restaurant's SMTP account.
              If the server has no SMTP configured, your mail app opens with the receipt prefilled.
            </p>
          </div>
        </Dialog>
      )}
    </div>);

}
