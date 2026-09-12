import { useEffect, useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs, Field, FilterChips, inputClass } from '../components/ui/Controls';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';
import { useSettings } from '../state/SettingsContext';
import { invoices as mockInvoices } from '../data/business';

const statusTone = {
  Draft: 'neutral',
  Sent: 'blue',
  Paid: 'green',
  Overdue: 'red'
};

const rs = (v) => `Rs ${(Number(v) || 0).toLocaleString('en-IN')}`;

function shortDue(due) {
  if (!due) return '—';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return due;
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

function isOverdue(inv) {
  return inv.status === 'Sent' && inv.due_date && new Date(inv.due_date) < new Date();
}

const emptyLine = { description: '', qty: 1, unit_price: null };

export function Invoices() {
  const { settings } = useSettings();
  const [tab, setTab] = useState('All');
  const [composing, setComposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [delivery, setDelivery] = useState('Email');
  const [invoiceList, setInvoiceList] = useState(null);
  const [active, setActive] = useState(null);
  const [party, setParty] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([{ ...emptyLine }]);
  const toast = useToast();

  async function load() {
    try {
      const data = await api('/invoices');
      setInvoiceList(data.data || []);
    } catch {
      setInvoiceList(mockInvoices);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = invoiceList || [];
  const counts = list.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const rows = tab === 'All' ? list : list.filter((i) => i.status === tab);
  const overdueCount = list.filter(isOverdue).length;

  const outstanding = list
    .filter((i) => i.status === 'Sent' || i.status === 'Overdue' || isOverdue(i))
    .reduce((s, i) => s + Number(i.amount), 0);

  const subtotal = items.reduce((s, l) => s + (l.qty || 0) * (Number(l.unit_price) || 0), 0);
  const tax = Math.round(subtotal * 0.13);

  function setItemField(idx, field, value) {
    setItems((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function openCompose() {
    setParty('');
    setDueDate('');
    setItems([{ ...emptyLine }]);
    setConfirming(false);
    setComposing((c) => !c);
  }

  async function createInvoice(send) {
    if (!party.trim() || !dueDate) {
      toast('Enter a client and due date', { tone: 'red' });
      return;
    }
    const payload = {
      party: party.trim(),
      due_date: dueDate,
      items: items
        .filter((l) => l.description.trim() && Number(l.unit_price) > 0)
        .map((l) => ({ description: l.description.trim(), qty: Number(l.qty) || 1, unit_price: Number(l.unit_price) }))
    };
    try {
      const res = await api('/invoices', { method: 'POST', body: payload });
      if (send) {
        await api(`/invoices/${res.id}`, { method: 'PUT', body: { status: 'Sent' } });
      }
      toast(send ? 'Invoice sent' : 'Invoice saved as draft', { tone: 'green' });
      setComposing(false);
      setConfirming(false);
      load();
    } catch {
      toast('Could not save invoice — API offline', { tone: 'red' });
    }
  }

  async function setStatus(inv, status, message) {
    try {
      await api(`/invoices/${inv.id}`, { method: 'PUT', body: { status } });
      toast(message, { tone: 'green' });
      load();
    } catch {
      toast('API unavailable', { tone: 'red' });
    }
  }

  async function openInvoice(inv) {
    try {
      const data = await api(`/invoices/${inv.id}`);
      setActive(data.data || data);
    } catch {
      setActive(inv);
    }
  }

  const chasing = rows.filter((i) => i.status === 'Overdue' || isOverdue(i));

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Invoices" descriptor={`${rs(outstanding)} outstanding · ${overdueCount || (counts.Overdue || 0)} overdue`}>
        <Button variant="dark" onClick={openCompose}>
          {composing ? 'Back to list' : 'Create invoice'}
        </Button>
      </PageHeader>

      {!composing && chasing.length > 0 && (
        <AlertBanner
          className="mb-5"
          action={
            <Button size="sm" variant="red" onClick={() => chasing.forEach((c) => setStatus(c, c.status, `Chase sent to ${c.party}`))}>
              Chase {chasing.length <= 1 ? 'invoice' : `all ${chasing.length}`}
            </Button>
          }>
          {chasing.length} invoice{chasing.length === 1 ? '' : 's'} overdue — {chasing.map((c) => c.party.split(' ')[0]).join(', ')}
        </AlertBanner>
      )}

      {composing ? (
        <Card className="mx-auto max-w-[760px]">
          <div className="flex items-start justify-between border-b border-line pb-5">
            <div>
              <h2 className="text-lg font-extrabold text-ink">New invoice</h2>
              <p className="text-sm text-meta">{settings.businessName} · VAT {settings.vatNo}</p>
            </div>
            <Pill tone="neutral">Draft</Pill>
          </div>

          <div className="grid gap-4 border-b border-line py-5 sm:grid-cols-2">
            <Field label="Billed to">
              <input
                className={inputClass}
                placeholder="Client or vendor company"
                value={party}
                onChange={(e) => setParty(e.target.value)} />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>

          <div className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Line items</p>
              <Button size="sm" variant="outline" icon={<PlusIcon className="h-3.5 w-3.5" />} onClick={() => setItems((p) => [...p, { ...emptyLine }])}>
                Add line
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Description</th>
                  <th className="w-24 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Qty</th>
                  <th className="w-28 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Rate</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((l, idx) => (
                  <tr key={idx} className="border-b border-line">
                    <td className="py-2 pr-2">
                      <input
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                        placeholder="Catering dinner — 40 covers"
                        value={l.description}
                        onChange={(e) => setItemField(idx, 'description', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-right font-mono text-sm text-ink focus:border-ink focus:outline-none"
                        value={l.qty || ''}
                        onChange={(e) => setItemField(idx, 'qty', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min="0"
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-right font-mono text-sm text-ink focus:border-ink focus:outline-none"
                        placeholder="1850"
                        value={l.unit_price ?? ''}
                        onChange={(e) => setItemField(idx, 'unit_price', e.target.value)} />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        aria-label="Remove line"
                        disabled={items.length === 1}
                        onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        className="p-1 text-meta transition-colors hover:text-status-red disabled:opacity-30">
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto mt-2 w-full max-w-[280px] space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-meta">Subtotal</dt>
              <dd className="font-mono font-semibold">{rs(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-meta">VAT 13%</dt>
              <dd className="font-mono font-semibold">{rs(tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-mono font-extrabold">{rs(subtotal + tax)}</dd>
            </div>
          </dl>

          {confirming ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Confirm & send</p>
              <div className="rounded-xl border border-line bg-canvas p-4 text-sm">
                <p className="font-semibold text-ink">{party || 'Untitled client'}</p>
                <p className="mt-1 font-mono text-meta">{rs(subtotal + tax)} · Due {shortDue(dueDate)}</p>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Delivery method</p>
                <FilterChips options={['Email', 'Share link']} value={delivery} onChange={setDelivery} />
              </div>
              <div className="mt-5 flex items-center gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button>
                <Button variant="green" onClick={() => createInvoice(true)}>Send</Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 border-t border-line pt-5">
              <Button variant="outline" onClick={() => createInvoice(false)}>Save draft</Button>
              <Button variant="dark" onClick={() => setConfirming(true)} disabled={!party.trim() || !dueDate}>Send invoice</Button>
            </div>
          )}
        </Card>
      ) : invoiceList === null ? (
        <Card>
          <div className="flex items-center justify-center py-16 text-sm text-meta">Loading invoices…</div>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <Tabs
              options={['All', 'Draft', 'Sent', 'Paid', 'Overdue']}
              value={tab}
              onChange={setTab}
              counts={counts}
              danger="Overdue" />
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Client / vendor</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Due date</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const overdue = isOverdue(inv);
                  const status = overdue ? 'Overdue' : inv.status;
                  return (
                    <Tr key={inv.id} onClick={() => openInvoice(inv)}>
                      <Td className="font-mono text-sm font-semibold">
                        {inv.id.indexOf('-') > 0 && inv.id.indexOf('-') < 4 ? inv.id : `INV-${inv.id.slice(0, 4).toUpperCase()}`}
                      </Td>
                      <Td className="text-sm">{inv.party}</Td>
                      <Td className="text-right font-mono text-sm font-bold">{inv.amount && typeof inv.amount === 'number' ? rs(inv.amount) : inv.amount}</Td>
                      <Td className="text-sm text-meta">{inv.due_date ? shortDue(inv.due_date) : inv.due}</Td>
                      <Td>
                        <Pill tone={statusTone[status]} dot>{status}</Pill>
                      </Td>
                      <Td className="text-right">
                        {status === 'Overdue' ? (
                          <Button size="sm" variant="red" onClick={(e) => { e.stopPropagation(); setStatus(inv, inv.status, `Chase sent to ${inv.party}`); }}>
                            Chase
                          </Button>
                        ) : status === 'Draft' ? (
                          <Button size="sm" variant="dark" onClick={(e) => { e.stopPropagation(); setStatus(inv, 'Sent', `${inv.party} — invoice sent`); }}>
                            Send
                          </Button>
                        ) : status === 'Sent' ? (
                          <Button size="sm" variant="green" onClick={(e) => { e.stopPropagation(); setStatus(inv, 'Paid', `${inv.party} — marked paid`); }}>
                            Mark paid
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline">Open</Button>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
                {rows.length === 0 && (
                  <Tr>
                    <Td colSpan={6}>
                      <EmptyState
                        compact
                        tone="blue"
                        title="No invoices here"
                        description={tab === 'All' ? 'Create your first invoice.' : `No ${tab.toLowerCase()} invoices right now.`}
                        action={<Button size="sm" variant="dark" onClick={openCompose}>Create invoice</Button>} />
                    </Td>
                  </Tr>
                )}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}

      {active && (
        <DetailDrawer
          open
          onClose={() => setActive(null)}
          title={active.id}
          subtitle={active.party}
          footer={
            <>
              {active.status === 'Draft' && (
                <Button variant="dark" full onClick={() => { setStatus(active, 'Sent', 'Invoice sent'); setActive(null); }}>
                  Send invoice
                </Button>
              )}
              {(active.status === 'Sent' || isOverdue(active)) && (
                <Button variant="green" full onClick={() => { setStatus(active, 'Paid', 'Marked as paid'); setActive(null); }}>
                  Mark as paid
                </Button>
              )}
              <Button variant="outline" full onClick={() => { toast(`Receipt emailed to ${active.party}`, { tone: 'green' }); setActive(null); }}>
                Email receipt
              </Button>
            </>
          }>
          <dl className="divide-y divide-line">
            <DetailRow label="Amount" value={typeof active.amount === 'number' ? rs(active.amount) : active.amount} mono tone="green" />
            <DetailRow label="Due date" value={active.due_date ? shortDue(active.due_date) : active.due} />
            <DetailRow label="Status" value={active.status} badge={<Pill tone={statusTone[isOverdue(active) ? 'Overdue' : active.status]} dot>{isOverdue(active) ? 'Overdue' : active.status}</Pill>} />
            <DetailRow label="Branch" value={active.branch_id ? 'Main branch' : '—'} />
            <DetailRow label="Created" value={active.created_at ? shortDue(active.created_at) : '—'} />
          </dl>

          {(active.items && active.items.length > 0) ? (
            <DetailSection title="Items">
              <div className="overflow-hidden rounded-xl border border-line bg-canvas">
                {active.items.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="min-w-0 truncate text-sm text-ink">{l.description}<span className="text-meta"> × {l.qty}</span></span>
                    <span className="shrink-0 font-mono text-sm font-semibold">{rs(l.qty * l.unit_price)}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          ) : (
            typeof active.amount === 'string' && (
              <DetailSection title="Items">
                <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-meta">
                  Itemised breakdown shown in the emailed PDF. This invoice was created before itemised line items were stored.
                </p>
              </DetailSection>
            )
          )}
        </DetailDrawer>
      )}
    </div>
  );
}