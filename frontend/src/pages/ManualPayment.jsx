import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BanknoteIcon,
  CheckIcon,
  CreditCardIcon,
  DeleteIcon,
  QrCodeIcon,
  SplitIcon } from
'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { useToast } from '../components/ui/Toast';
import { useSettings } from '../state/SettingsContext';
import { printReceiptHtml } from '../utils/printReceipt';
import api from '../api/client';

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
const quickAmounts = ['500', '1000', '2000', '5000'];

const methods = [
{ name: 'Cash', icon: BanknoteIcon, hint: 'Drawer opens' },
{ name: 'Card', icon: CreditCardIcon, hint: 'Terminal 2' },
{ name: 'QR', icon: QrCodeIcon, hint: 'Fonepay / eSewa' },
{ name: 'Split', icon: SplitIcon, hint: 'Across covers' }];


export function ManualPayment() {
  const toast = useToast();
  const { settings } = useSettings();
  const [amount, setAmount] = useState('2480');
  const [method, setMethod] = useState('Cash');
  const [confirmed, setConfirmed] = useState(false);
  // The payment is recorded server-side on confirm; these fields carry the
  // outcome onto the receipt card (real txn id, or offline notice).
  const [record, setRecord] = useState(null); // { id, offline }
  const [paidAt, setPaidAt] = useState('');

  const confirmPayment = async () => {
    const value = Number(amount || 0);
    if (!value || value <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    setPaidAt(now);
    setConfirmed(true);
    try {
      const tx = await api('/transactions/manual', {
        method: 'POST',
        body: { amount: value, method: method.toLowerCase() }
      });
      setRecord({ id: tx?.id || null, offline: false });
      toast.success(`Rs ${display} payment recorded in Transactions`);
    } catch {
      // API offline — keep the local receipt but be honest that nothing was recorded.
      setRecord({ id: null, offline: true });
      toast.error('Payment completed, but the server is unreachable — it was not recorded in Transactions', { tone: 'red' });
    }
  };

  const resetPayment = () => {
    setConfirmed(false);
    setAmount('2480');
    setMethod('Cash');
    setRecord(null);
  };

  const press = (k) => {
    setConfirmed(false);
    if (k === '⌫') setAmount((a) => a.length > 1 ? a.slice(0, -1) : '0');else
    setAmount((a) => a === '0' ? k : a + k);
  };

  const display = Number(amount || 0).toLocaleString('en-IN');

  const printReceipt = () => {
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    // Manual payments are amount+method only (no itemized order), so the
    // item lines below are the demo set; the footer does carry the real
    // recorded transaction id when the server confirmed the payment.
    const items = [
      ['2× Momo Jhol', 'Rs 780'],
      ['1× Chicken Chilli', 'Rs 420'],
      ['1× Thakali Set', 'Rs 995']
    ];
    const ok = printReceiptHtml({
      title: settings.businessName,
      subtitle: `${settings.city} · VAT ${settings.vatNo}`,
      subline: 'Table 12 · Register 1',
      meta: now,
      items,
      ledger: [
        ['Subtotal', 'Rs 2,195'],
        ['Service charge 10%', 'Rs 220'],
        ['VAT 13%', 'Rs 65']
      ],
      total: `Rs ${display}`,
      paidBy: method,
      paidAt: now,
      footerLines: [
        record && !record.offline && record.id
          ? `Receipt ${String(record.id).slice(0, 8).toUpperCase()} · Recorded in Transactions`
          : 'Receipt #1042 · Fiscal ID IRD-2026-08842',
        'Nepal Revenue certified'
      ],
      thanks: 'Thank you, visit again'
    });
    if (ok) {
      toast.success('Receipt printed');
    } else {
      toast.error('Enable pop-ups to print this receipt');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Manual Payment"
        descriptor="Table 12 · Order #1042 · Riya at Register 1">
        
        <Pill tone="neutral">Cashier only</Pill>
      </PageHeader>


      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
            Amount due
          </p>
          <p className="mt-1 font-mono text-[44px] font-extrabold leading-none tracking-tight text-ink">
            Rs {display}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {quickAmounts.map((q) =>
            <button
              key={q}
              type="button"
              onClick={() => {
                setAmount(q);
                setConfirmed(false);
              }}
              className="h-9 rounded-full border border-line bg-canvas px-4 font-mono text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">

                Rs {Number(q).toLocaleString('en-IN')}
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {keys.map((k) =>
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="flex h-16 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-xl font-bold text-ink transition-colors duration-150 ease-soft hover:bg-surface active:bg-line">

                {k === '⌫' ? <DeleteIcon className="h-5 w-5" /> : k}
              </button>
            )}
          </div>
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
            Payment method
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {methods.map((m) => {
              const Icon = m.icon;
              const active = m.name === method;
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setMethod(m.name)}
                  aria-pressed={active}
                  className={`flex h-[124px] flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors duration-150 ease-soft ${
                  active ?
                  'border-ink bg-ink text-white' :
                  'border-line bg-canvas text-ink hover:border-ink/30'}`
                  }>

                  <Icon className="h-6 w-6" />
                  <span>
                    <span className="block text-base font-bold">{m.name}</span>
                    <span
                      className={`block text-xs ${active ? 'text-white/70' : 'text-meta'}`}>

                      {m.hint}
                    </span>
                  </span>
                </button>);

            })}
          </div>

          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-meta">Subtotal</dt>
              <dd className="font-mono font-semibold">Rs 2,195</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-meta">Service charge 10%</dt>
              <dd className="font-mono font-semibold">Rs 220</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-meta">VAT 13%</dt>
              <dd className="font-mono font-semibold">Rs 65</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-mono font-extrabold">Rs {display}</dd>
            </div>
          </dl>

          <div className="mt-5 flex gap-2">
            <Button variant="outline" onClick={() => setAmount('0')}>
              Cancel
            </Button>
            <Button variant="green" full onClick={confirmPayment}>
              Confirm Rs {display} · {method}
            </Button>
          </div>
        </Card>

        <AnimatePresence>
          {confirmed &&
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="w-full lg:w-[320px]">

              <Card className="h-full">
                <div className="flex items-center justify-between">
                  <Pill tone="green" dot>
                    Paid
                  </Pill>
                  <span className="font-mono text-xs text-meta">{paidAt}</span>
                </div>
                <div className="mt-4 border-b border-dashed border-line pb-4 text-center">
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-ink">
                    {settings.businessName}
                  </p>
                  <p className="text-xs text-meta">VAT {settings.vatNo} · Table 12</p>
                </div>
                <ul className="space-y-1.5 border-b border-dashed border-line py-4 text-sm">
                  <li className="flex justify-between">
                    <span>2× Momo Jhol</span>
                    <span className="font-mono">Rs 780</span>
                  </li>
                  <li className="flex justify-between">
                    <span>1× Chicken Chilli</span>
                    <span className="font-mono">Rs 420</span>
                  </li>
                  <li className="flex justify-between">
                    <span>1× Thakali Set</span>
                    <span className="font-mono">Rs 995</span>
                  </li>
                </ul>
                <div className="flex items-center justify-between py-4">
                  <span className="text-sm font-bold">Paid by {method}</span>
                  <span className="font-mono text-lg font-extrabold">Rs {display}</span>
                </div>
                {record && (
                  <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                  record.offline ?
                  'border-status-amber/40 bg-tint-amber text-status-amber' :
                  'border-status-green/40 bg-tint-green text-status-green'}`}>

                    {record.offline ?
                    'Not recorded — server unreachable' :
                    <>
                      <CheckIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        Recorded in Transactions · {String(record.id).slice(0, 8).toUpperCase()}
                      </span>
                    </>
                    }
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-xl bg-tint-green px-3 py-2 text-xs font-semibold text-status-green">
                  <CheckIcon className="h-4 w-4" />
                  Fiscal ID IRD-2026-08842 certified
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setConfirmed(false);
                    setRecord(null);
                    if (record && !record.offline) toast('Recorded payments can be refunded from Refunds');
                  }}>
                    Void
                  </Button>
                  <Button size="sm" variant="dark" full onClick={printReceipt}>
                    Print receipt
                  </Button>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" full onClick={() => toast.success('Receipt emailed')}>
                    Email receipt
                  </Button>
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="green" full onClick={resetPayment}>
                    Done
                  </Button>
                </div>
              </Card>
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </div>);

}
