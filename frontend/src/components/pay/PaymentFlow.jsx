import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BanknoteIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  DivideIcon,
  Loader2Icon,
  PrinterIcon,
  ScanLineIcon,
  SmartphoneIcon,
  Undo2Icon,
  XCircleIcon,
  XIcon
} from 'lucide-react';
import { Button } from '../ui/Button';
import { GatewayTiles, GATEWAYS } from './GatewayTiles';
import { SplitBill } from './SplitBill';
import { useSound } from '../../state/SoundContext';

const fmt = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// Explicit payment states — the ribbon renders the plain-English label and
// each phase has its own screen so the cashier can never be unsure.
const STATE_UI = {
  pending: { label: 'PAYMENT PENDING', cls: 'bg-tint-amber text-status-amber border-status-amber/30',
    dot: 'bg-status-amber', hint: 'Awaiting confirmation' },
  processing: { label: 'PAYMENT PROCESSING', cls: 'bg-tint-blue text-status-blue border-status-blue/30',
    dot: 'bg-status-blue', hint: 'Do not close or refresh' },
  success: { label: 'PAYMENT SUCCESSFUL', cls: 'bg-tint-green text-status-green border-status-green/30',
    dot: 'bg-status-green', hint: 'Transaction recorded' },
  failed: { label: 'PAYMENT FAILED', cls: 'bg-tint-red text-status-red border-status-red/30',
    dot: 'bg-status-red', hint: 'Nothing was charged' },
  cancelled: { label: 'PAYMENT CANCELLED', cls: 'bg-canvas text-meta border-line',
    dot: 'bg-meta', hint: 'Order kept as-is' }
};

const CASH_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

/**
 * SuccessChime — plays the payment-success sound exactly once when the
 * success screen mounts. Register's chargeOnce also plays it; the engine's
 * 500ms cooldown makes the second call a no-op, so double-plays are impossible.
 */
function SuccessChime() {
  const { play } = useSound();
  useEffect(() => {
    play('paymentSuccess');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function PaymentFlow({
  open,
  total,
  subtotal,
  discountAmount = 0,
  vat = 0,
  itemCount = 0,
  type = '',
  table = '',
  customer = '',
  items = [],
  splitBusy = false,
  onCharge,
  onSplit,
  onPrint,
  onDone,
  onClose
}) {
  const [phase, setPhase] = useState('pending'); // pending | processing | success | failed | cancelled | split
  const { play: playSound } = useSound();
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState(0);
  const [failMessage, setFailMessage] = useState('');
  const [receiptData, setReceiptData] = useState(null);
  const busyRef = useRef(false);

  const isGateway = method !== 'cash';
  const change = Math.max(0, tendered - total);
  const readyToConfirm = tendered >= total;

  // Reset the whole panel whenever it's reopened.
  useEffect(() => {
    if (open) {
      setPhase('pending');
      setMethod('cash');
      setTendered(0);
      setFailMessage('');
      setReceiptData(null);
      busyRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (phase === 'processing') return; // never interrupt a charge
      if (phase === 'pending' || phase === 'split') {
        if (e.key === 'Enter' && !typing && phase === 'pending' && (isGateway || readyToConfirm)) {
          e.preventDefault();
          confirm();
        }
        if (e.key === 'Escape' && !typing && phase !== 'split') {
          e.preventDefault();
          setPhase('cancelled');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const trimEscape = (v) => String(v).replace(/\D/g, '').slice(0, 9);

  const pressKey = (k) => {
    setTendered((t) => {
      if (k === '⌫') {
        const s = trimEscape(t);
        return s.length > 1 ? Number(s.slice(0, -1)) : 0;
      }
      const next = t === 0 ? k : `${t}${k}`;
      return Number(trimEscape(next));
    });
  };

  const quickTenders = [
    { label: 'Exact', value: total },
    { label: `Rs ${Math.ceil(total / 500) * 500}`, value: Math.ceil(total / 500) * 500 },
    { label: `Rs ${Math.ceil(total / 1000) * 1000}`, value: Math.ceil(total / 1000) * 1000 }
  ];

  const confirm = async () => {
    if (busyRef.current) return; // duplicate-submission guard
    if (!isGateway && !readyToConfirm) return;
    busyRef.current = true;
    setPhase('processing');
    // Simulated gateway authorisation for card / QR / wallet so the cashier
    // sees a real PENDING→PROCESSING handshake instead of an instant flash.
    if (isGateway) {
      await new Promise((r) => setTimeout(r, 1400));
    }
    try {
      const ok = await onCharge(total, method, { tendered: isGateway ? 0 : tendered, change: isGateway ? 0 : change });
      if (ok) {
        setReceiptData({ amount: total, method, tendered: isGateway ? 0 : tendered, change: isGateway ? 0 : change });
        setPhase('success');
      } else {
        playSound('paymentFailed');
        setFailMessage(`${GATEWAYS.find((g) => g.key === method)?.label || method} was declined or the request failed.`);
        setPhase('failed');
      }
    } catch {
      playSound('paymentFailed');
      setFailMessage('The payment could not be confirmed. No charge was made.');
      setPhase('failed');
    } finally {
      busyRef.current = false;
    }
  };

  const confirmSplit = async (segments) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('processing');
    try {
      const ok = await onSplit(segments);
      setReceiptData({ amount: segments.reduce((s, x) => s + x.amount, 0), method: 'split', tendered: 0, change: 0 });
      if (ok) setPhase('success');
      else {
        playSound('paymentFailed');
        setFailMessage('Split payment could not be confirmed. Nothing was charged.');
        setPhase('failed');
      }
    } catch {
      playSound('paymentFailed');
      setFailMessage('Split payment failed. Nothing was charged.');
      setPhase('failed');
    } finally {
      busyRef.current = false;
    }
  };

  const print = () => {
    if (receiptData && onPrint) onPrint(receiptData);
  };

  const state = STATE_UI[phase];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" />

          <motion.div
            role="dialog"
            aria-label="Payment"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop-lg">

            {/* status ribbon — always visible, never ambiguous */}
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 ${state.cls}`}>
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${state.dot}`} aria-hidden="true" />
                <div>
                  <p className="text-sm font-black tracking-title">{state.label}</p>
                  <p className="text-xs opacity-70">{state.hint}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close payment"
                disabled={phase === 'processing'}
                onClick={() => phase === 'success' ? onDone?.() : setPhase('cancelled')}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ease-soft hover:bg-ink/10 disabled:opacity-30">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* body */}
            <div className="scroll-thin max-h-[70vh] overflow-y-auto px-5 py-4">
              {phase === 'pending' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-caption font-semibold text-meta">
                        Total due{type ? ` · ${type}` : ''}{table ? ` · Table ${table}` : ''}{customer !== 'Walk-in' && customer ? ` · ${customer}` : ''}
                      </p>
                      <p className="font-mono text-4xl font-black tracking-tight text-ink">{fmt(total)}</p>
                    </div>
                    <span className="rounded-full bg-canvas px-3 py-1 font-mono text-caption font-bold text-meta">
                      {itemCount} item{itemCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
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
                    <div className="flex justify-between border-t border-line pt-1.5">
                      <span className="font-bold text-ink">Total</span>
                      <span className="font-mono font-black text-ink">{fmt(total)}</span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-caption font-semibold text-meta">Payment method</p>
                    <GatewayTiles value={GATEWAYS.find((g) => g.key === method)?.label} onChange={(label) => {
                      const match = GATEWAYS.find((g) => g.label === label);
                      setMethod(match ? match.key : label.toLowerCase());
                    }} />
                  </div>

                  {!isGateway ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {quickTenders.map((q) => {
                          const active = tendered === q.value;
                          return (
                            <button
                              key={q.label}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setTendered(q.value)}
                              className={`flex h-11 items-center justify-center rounded-xl border text-sm font-bold transition-colors duration-150 ease-soft ${
                                active ? 'border-ink bg-ink text-white' : 'border-line bg-canvas text-ink hover:border-ink/30'
                              }`}>
                              {q.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
                          <p className="text-caption font-semibold text-meta">Amount received</p>
                          <p className={`font-mono text-xl font-black ${tendered >= total ? 'text-ink' : 'text-status-amber'}`}>
                            {fmt(tendered)}
                          </p>
                        </div>
                        <div className={`rounded-xl border px-3 py-2.5 ${change > 0 ? 'border-status-green/30 bg-tint-green' : 'border-line bg-canvas'}`}>
                          <p className="text-caption font-semibold text-meta">Change</p>
                          <p className={`font-mono text-xl font-black ${change > 0 ? 'text-status-green' : 'text-meta'}`}>
                            {change > 0 ? '−' : ''}{fmt(change)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {CASH_KEYS.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => pressKey(k)}
                            className="flex h-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/30 hover:bg-surface">
                            {k === '⌫' ? '⌫' : k}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-3 rounded-xl border border-status-blue/25 bg-tint-blue px-4 py-3 ${method}`}>
                      {method === 'card' ? <ScanLineIcon className="h-5 w-5 shrink-0 text-status-blue" />
                        : <SmartphoneIcon className="h-5 w-5 shrink-0 text-status-blue" />}
                      <p className="text-sm font-semibold text-status-blue">
                        <span className="font-black">{GATEWAYS.find((g) => g.key === method)?.label}</span> ready — swipe, tap or scan now, then confirm the charge.
                      </p>
                    </div>
                  )}

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhase('split')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-canvas py-3 text-sm font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                      <DivideIcon className="h-4 w-4 text-meta" />
                      Split this bill
                    </button>
                  )}
                </div>
              )}

              {phase === 'split' && (
                <SplitBill
                  total={total}
                  items={items}
                  onCharge={confirmSplit}
                  busy={splitBusy}
                />
              )}

              {phase === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-tint-blue">
                    <Loader2Icon className="h-9 w-9 animate-spin text-status-blue" />
                  </span>
                  <h2 className="mt-5 text-xl font-extrabold text-ink">
                    {isGateway ? `Authorising ${GATEWAYS.find((g) => g.key === method)?.label || method}…` : 'Recording cash payment…'}
                  </h2>
                  <p className="mt-1 text-sm text-meta">
                    {isGateway
                      ? `Swipe / tap / scan the ${GATEWAYS.find((g) => g.key === method)?.label || method} device now — do not navigate away.`
                      : `Taking ${fmt(total)} · change ${fmt(change)}`}
                  </p>
                  <p className="mt-6 text-caption font-semibold text-status-blue">Do not close this screen</p>
                </div>
              )}

              {phase === 'success' && (
                <SuccessChime />
              )}

              {phase === 'success' && (
                <div className="flex flex-col items-center justify-center py-10 pt-0 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-tint-green">
                    <CheckCircle2Icon className="h-10 w-10 text-status-green" />
                  </span>
                  <h2 className="mt-5 text-2xl font-black tracking-tight text-ink">{fmt(receiptData?.amount || total)}</h2>
                  <p className="mt-1 text-sm text-meta">
                    Paid by {receiptData?.method || ''} · sent to kitchen{receiptData?.method === 'cash' && receiptData.change > 0 ? '' : ''}
                  </p>
                  {receiptData && receiptData.method === 'cash' && receiptData.change > 0 && (
                    <div className="mt-4 rounded-xl border border-status-green/30 bg-tint-green px-5 py-3">
                      <p className="text-caption font-semibold text-status-green">Give change</p>
                      <p className="font-mono text-2xl font-black text-status-green">{fmt(receiptData.change)}</p>
                    </div>
                  )}
                  <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                    <Button variant="dark" full size="lg" icon={<PrinterIcon className="h-4 w-4" />} onClick={print}>
                      Print receipt
                    </Button>
                  </div>
                </div>
              )}

              {phase === 'failed' && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-tint-red">
                    <XCircleIcon className="h-10 w-10 text-status-red" />
                  </span>
                  <h2 className="mt-5 text-xl font-extrabold text-ink">Payment not taken</h2>
                  <p className="mt-1 max-w-sm text-sm text-meta">{failMessage}</p>
                  <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                    <Button variant="dark" full size="lg" onClick={() => setPhase('pending')}>
                      Try again
                    </Button>
                  </div>
                </div>
              )}

              {phase === 'cancelled' && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-canvas">
                    <CircleSlashIcon className="h-10 w-10 text-meta" />
                  </span>
                  <h2 className="mt-5 text-xl font-extrabold text-ink">Payment cancelled</h2>
                  <p className="mt-1 max-w-sm text-sm text-meta">
                    No charge was made. The order is untouched and still open on the register.
                  </p>
                  <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-2">
                    <Button variant="outline" full onClick={() => setPhase('pending')}>
                      <Undo2Icon className="h-4 w-4" /> Resume
                    </Button>
                    <Button variant="dark" full onClick={() => onClose?.()}>
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* footer — the money shot, impossible to miss when pending */}
            {phase === 'pending' && (
              <div className="border-t border-line p-4">
                <button
                  type="button"
                  disabled={!isGateway && !readyToConfirm}
                  onClick={confirm}
                  className={`relative flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-black text-white transition-all duration-150 ease-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${
                    isGateway || readyToConfirm
                      ? 'bg-ink shadow-[0_16px_40px_-16px_rgba(28,27,25,0.8)] hover:-translate-y-0.5 hover:bg-ink/95'
                      : 'bg-ink/70'
                  }`}>
                  <BanknoteIcon className="h-6 w-6" />
                  {isGateway ? `Charge ${fmt(total)}` : `Receive ${fmt(tendered)} · Change ${fmt(change)}`}
                </button>
                {!isGateway && !readyToConfirm && (
                  <p className="mt-2 text-center text-caption font-semibold text-status-amber">
                    Enter or quick-select the cash received to enable charging
                  </p>
                )}
                <p className="mt-2 text-center text-caption text-meta">
                  {isGateway ? 'Swiping a card or phone auto-confirms in ~1.5s' : 'Collect cash, then confirm — change is shown above'}
                </p>
              </div>
            )}

            {phase === 'split' && (
              <div className="border-t border-line p-3">
                <Button variant="quiet" full onClick={() => setPhase('pending')}>
                  Back to payment
                </Button>
              </div>
            )}

            {phase === 'success' && (
              <div className="border-t border-line p-4">
                <Button variant="outline" full size="lg" onClick={() => onDone?.()}>
                  Done — start next order
                </Button>
              </div>
            )}

            {phase === 'failed' && (
              <div className="border-t border-line p-4">
                <Button variant="outline" full onClick={() => onClose?.()}>
                  Keep order and close
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}