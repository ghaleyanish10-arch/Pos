import { useState, useCallback } from 'react';
import { LockIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { StatRow } from '../components/ui/StatCard';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { transactions } from '../data/sell';
import { failedTransactions } from '../data/pos';

export function Fiscal() {
  const toast = useToast();
  const [retryOpen, setRetryOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [retryCount, setRetryCount] = useState({});
  const [auditNote, setAuditNote] = useState('');
  const [overrideInput, setOverrideInput] = useState('');
  const [isOverride, setIsOverride] = useState(false);

  const openRetry = useCallback((txn) => {
    setSelectedTxn(txn);
    setAuditNote('');
    setOverrideInput('');
    setIsOverride(false);
    setRetryOpen(true);
  }, []);

  const currentRetries = selectedTxn ? (retryCount[selectedTxn.id] || 0) : 0;
  const needsAudit = currentRetries >= 1;
  const canSubmit = needsAudit ? auditNote.trim().length > 0 : true;

  const handleRetry = useCallback(() => {
    if (!canSubmit || !selectedTxn) return;
    setRetryCount((prev) => ({
      ...prev,
      [selectedTxn.id]: (prev[selectedTxn.id] || 0) + 1
    }));
    setRetryOpen(false);
    toast.success('Resubmitted to IRD');
  }, [canSubmit, selectedTxn, toast]);

  const handleOverride = useCallback(() => {
    if (!canSubmit || !selectedTxn) return;
    setRetryCount((prev) => ({
      ...prev,
      [selectedTxn.id]: (prev[selectedTxn.id] || 0) + 1
    }));
    setRetryOpen(false);
    toast.success('Override applied — resubmitted to IRD');
  }, [canSubmit, selectedTxn, toast]);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Fiscal Log"
        descriptor="Tamper-proof · read only · IRD Nepal">
        
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-meta">
          <LockIcon className="h-3.5 w-3.5" />
          Immutable record
        </span>
        <Button variant="outline">Export for audit</Button>
      </PageHeader>

      <div className="mb-5">
        <StatRow
          stats={[
          { label: 'Invoices logged today', value: '126', meta: 'Since 11:00' },
          { label: 'Certified', value: '124', meta: '98.4% first attempt' },
          { label: 'Pending certification', value: '2', meta: 'Retry queued' },
          { label: 'Last IRD sync', value: '14:48', meta: 'Every 15 min' }]
          } />
        
      </div>

      <AlertBanner
        className="mb-5"
        action={
        <Button size="sm" variant="red" onClick={() => {
          const failed = failedTransactions[0];
          if (failed) openRetry(failed);
        }}>
            Resend to IRD
          </Button>
        }>
        
        Certification failed for TXN-8836 — IRD gateway returned timeout at 13:21
      </AlertBanner>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Transaction</Th>
              <Th>Fiscal ID</Th>
              <Th>Order ref</Th>
              <Th className="text-right">Amount</Th>
              <Th>Certification</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const isFailed = t.status === 'Failed';
              const retries = retryCount[t.id] || 0;
              return (
                <Tr key={t.id}>
                  <Td className="font-mono text-sm text-meta">{t.time}</Td>
                  <Td className="font-mono text-sm font-semibold">{t.id}</Td>
                  <Td className="font-mono text-sm">{t.fiscalId}</Td>
                  <Td className="text-sm">{t.ref}</Td>
                  <Td className="text-right font-mono text-sm font-bold">{t.amount}</Td>
                  <Td>
                    {t.certified === 'Certified' ?
                    <Pill tone="green" dot>
                          Certified
                        </Pill> :
                    isFailed ?
                    <Pill tone="red" dot>
                          Failed
                        </Pill> :
                    <Pill tone="amber" dot>
                          Pending certification
                        </Pill>
                    }
                  </Td>
                  <Td>
                    {isFailed &&
                    <Button size="sm" variant="red" onClick={() => {
                      const failed = failedTransactions.find((f) => f.id === t.id);
                      if (failed) openRetry(failed);
                    }}>
                      {retries > 0 ? `Retry (${retries})` : 'Resubmit'}
                    </Button>
                    }
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      <p className="mt-3 text-xs text-meta">
        Entries cannot be edited or deleted. Corrections are posted as new offsetting
        invoices and linked to the original fiscal ID.
      </p>

      <Drawer
        open={retryOpen}
        onClose={() => setRetryOpen(false)}
        title="IRD submission"
        subtitle={selectedTxn ? selectedTxn.id : ''}
        footer={
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={() => setRetryOpen(false)}>Cancel</Button>
            {!isOverride ?
            <Button variant="red" full disabled={!canSubmit} onClick={handleRetry}>
                Retry submission
              </Button> :
            <Button variant="red" full disabled={!canSubmit} onClick={handleOverride}>
                Override &amp; submit
              </Button>
            }
          </div>
        }
      >
        {selectedTxn &&
        <div className="space-y-5">
            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Submission payload
              </p>
              <dl className="space-y-1.5 text-sm">
                {Object.entries(selectedTxn.payload).filter(([k]) => k !== 'items').map(([k, v]) =>
                  <div key={k} className="flex justify-between">
                    <dt className="text-meta">{k}</dt>
                    <dd className="font-mono font-semibold text-ink">{String(v)}</dd>
                  </div>
                )}
              </dl>
              {selectedTxn.payload.items &&
              <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Line items
                  </p>
                  <dl className="space-y-1 text-sm">
                    {selectedTxn.payload.items.map((item, i) =>
                      <div key={i} className="flex justify-between">
                        <dt className="text-meta">{item.qty}× {item.desc}</dt>
                        <dd className="font-mono font-semibold text-ink">
                          Rs {(item.qty * item.rate).toLocaleString('en-IN')}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              }
            </div>

            <div className="rounded-xl border border-[#F3CFCC] bg-tint-red p-4">
              <p className="text-sm font-semibold text-status-red">
                {selectedTxn.error}
              </p>
              {currentRetries > 0 &&
              <p className="mt-1 text-xs text-status-red/80">
                Previous retries: {currentRetries}
              </p>
              }
            </div>

            {needsAudit &&
            <Field label="Audit note (required after first retry)">
                <textarea
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                  placeholder="Explain the reason for retry or override…"
                  rows={3}
                  className={`${inputClass} resize-none py-2`}
                />
              </Field>
            }

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant={isOverride ? 'dark' : 'outline'}
                onClick={() => setIsOverride(!isOverride)}
              >
                {isOverride ? 'Back to retry' : 'Manual override'}
              </Button>
              {isOverride &&
              <Field label="Override justification">
                  <input
                    type="text"
                    value={overrideInput}
                    onChange={(e) => setOverrideInput(e.target.value)}
                    placeholder="Enter override reference…"
                    className={inputClass}
                  />
                </Field>
              }
            </div>
          </div>
        }
      </Drawer>
    </div>);

}
