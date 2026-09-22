import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightIcon,
  PencilLineIcon,
  DownloadIcon,
  FileTextIcon,
  ReceiptIcon,
  Undo2Icon,
  UsersIcon,
  WalletIcon } from
'lucide-react';
import { PageHeader, SectionHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FilterChips, SearchInput, Tabs } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { StatRow } from '../components/ui/StatCard';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';
import { useSettings } from '../state/SettingsContext';

const rs = (v) => `Rs ${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

const TABS = ['Overview', 'Transactions', 'Invoices', 'Refunds', 'Payroll', 'Taxes'];
const RANGE_OPTIONS = ['Today', '7 days', '28 days', 'All time'];
const RANGE_DAYS = { 'Today': 1, '7 days': 7, '28 days': 28, 'All time': 0 };

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inWindow(iso, days) {
  if (!days) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now() - days * 86400000;
}

const statusTone = (s) => {
  const map = {
    Success: 'green', Paid: 'green', resolved: 'green',
    pending: 'amber', Sent: 'blue', Draft: 'neutral', requested: 'amber',
    cancelled: 'neutral', Failed: 'red', rejected: 'red', Overdue: 'red'
  };
  return map[s] || 'blue';
};

// ── Overview tab: one card per money domain, leading with its headline ──
function OverviewTab({ stats, onOpen }) {
  const cards = [
    {
      label: 'Payments settled',
      value: rs(stats.payments.total),
      meta: `${stats.payments.count} transactions`,
      icon: <WalletIcon className="h-5 w-5" />,
      tone: 'green',
      action: 'View transactions'
    },
    {
      label: 'Invoices outstanding',
      value: rs(stats.invoices.outstanding),
      meta: `${stats.invoices.overdue} overdue · ${stats.invoices.total} total`,
      icon: <FileTextIcon className="h-5 w-5" />,
      tone: stats.invoices.overdue > 0 ? 'red' : 'blue',
      action: 'View invoices'
    },
    {
      label: 'Refunds',
      value: rs(stats.refunds.total),
      meta: `${stats.refunds.pending} awaiting approval`,
      icon: <Undo2Icon className="h-5 w-5" />,
      tone: stats.refunds.pending > 0 ? 'amber' : 'neutral',
      action: 'View refunds'
    },
    {
      label: 'Payroll (current rates)',
      value: rs(stats.payroll.total),
      meta: `${stats.payroll.count} staff · weekly hours × rate`,
      icon: <UsersIcon className="h-5 w-5" />,
      tone: 'blue',
      action: 'View payroll'
    },
    {
      label: 'Tax collected (VAT)',
      value: rs(stats.tax.collected),
      meta: `${stats.tax.rate}% of settled sales`,
      icon: <ReceiptIcon className="h-5 w-5" />,
      tone: 'neutral',
      action: 'View taxes'
    }
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onOpen(c.action)}
          className="group rounded-card border border-line bg-surface p-5 text-left transition-colors duration-150 ease-soft hover:border-ink/30">
          <div className="flex items-center justify-between">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              c.tone === 'red' ? 'bg-tint-red text-status-red'
                : c.tone === 'amber' ? 'bg-tint-amber text-status-amber'
                  : c.tone === 'green' ? 'bg-tint-green text-status-green'
                    : c.tone === 'blue' ? 'bg-tint-blue text-status-blue'
                      : 'bg-canvas text-meta'}`}>
              {c.icon}
            </span>
            <ArrowRightIcon className="h-4 w-4 text-meta opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-3 text-caption font-semibold text-meta">{c.label}</p>
          <p className="mt-1.5 font-mono text-2xl font-extrabold tracking-tight text-ink">{c.value}</p>
          <p className="mt-2 text-xs leading-relaxed text-meta">{c.meta}</p>
        </button>
      ))}
    </div>
  );
}

/**
 * One payroll row with an inline-editable hourly rate. The rate saves through
 * PUT /staff/:id/rate (Store-Manager-and-up, enforced server-side); the line
 * recomputes hours × rate immediately so the estimate reflects the change
 * without a reload.
 */
function PayrollRateRow({ line, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(line.hourly_rate ?? ''));
  const [busy, setBusy] = useState(false);

  const rate = Number(line.hourly_rate) || 0;
  const amount = (Number(line.hours) || 0) * rate;

  const save = async () => {
    const next = Number(value);
    if (Number.isNaN(next) || next < 0) {
      toast('Rate must be a positive number', { tone: 'red' });
      return;
    }
    setBusy(true);
    try {
      await api(`/staff/${line.staff_id}/rate`, { method: 'PUT', body: { rate: next } });
      onSaved({ ...line, hourly_rate: next });
      setEditing(false);
      toast.success(`Rate updated for ${line.staff_name}`);
    } catch (e) {
      toast(e.message || 'Could not save the rate', { tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tr>
      <Td className="font-semibold">{line.staff_name}</Td>
      <Td className="text-right font-mono text-sm">{line.hours}</Td>
      <Td className="text-right">
        {editing ? (
          <span className="inline-flex items-center justify-end gap-1.5">
            <input
              autoFocus
              type="number"
              min="0"
              step="0.5"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setEditing(false); setValue(String(line.hourly_rate ?? '')); }
              }}
              disabled={busy}
              aria-label={`Hourly rate for ${line.staff_name}`}
              className="h-8 w-24 rounded-lg border border-line bg-surface px-2 text-right font-mono text-sm text-ink focus:border-ink focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="text-caption font-bold text-status-green hover:text-ink disabled:opacity-50">
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setValue(String(line.hourly_rate ?? '')); }}
              className="text-caption font-semibold text-meta hover:text-ink">
              ✕
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setValue(String(line.hourly_rate ?? '')); setEditing(true); }}
            title="Click to edit the hourly rate"
            className="group/rate inline-flex items-center gap-1.5 font-mono text-sm text-ink">
            {rs(line.hourly_rate)}
            <PencilLineIcon className="h-3 w-3 text-meta opacity-0 transition-opacity group-hover/rate:opacity-100" />
          </button>
        )}
      </Td>
      <Td className="text-right font-mono text-sm font-bold">{rs(amount)}</Td>
    </Tr>
  );
}

export function Finance() {
  const toast = useToast();
  const { settings } = useSettings();
  const [tab, setTab] = useState('Overview');
  const [range, setRange] = useState('7 days');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loadState, setLoadState] = useState('loading');

  const [txns, setTxns] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [payrollLines, setPayrollLines] = useState([]);

  const [active, setActive] = useState(null); // { kind: 'txn'|'invoice'|'refund', data }

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      const results = await Promise.allSettled([
        api('/transactions'),
        api('/invoices'),
        api('/refunds'),
        api('/payroll/rates')
      ]);
      if (cancelled) return;
      const [tx, inv, ref, pay] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
      setTxns(tx?.data || []);
      setInvoices(inv?.data || []);
      setRefunds(ref?.data || []);
      setPayrollLines(pay?.data || []);
      setLoadState(results.every((r) => r.status === 'rejected') ? 'error' : 'ready');
    })();
    return () => { cancelled = true; };
  }, []);

  const days = RANGE_DAYS[range];

  const scopedTxns = useMemo(() => txns.filter((t) => inWindow(t.created_at, days)), [txns, days]);
  const scopedInvoices = useMemo(() => invoices.filter((i) => inWindow(i.created_at, days)), [invoices, days]);
  const scopedRefunds = useMemo(() => refunds.filter((r) => inWindow(r.created_at, days)), [refunds, days]);

  const isOverdue = (inv) => inv.status === 'Sent' && inv.due_date && new Date(inv.due_date) < new Date();

  const stats = useMemo(() => {
    const success = scopedTxns.filter((t) => t.status === 'Success');
    const payments = {
      total: success.reduce((s, t) => s + (Number(t.amount) || 0), 0),
      count: success.length
    };
    const outstandingInv = scopedInvoices.filter((i) => i.status === 'Sent' || isOverdue(i));
    const invoicesS = {
      outstanding: outstandingInv.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      overdue: scopedInvoices.filter(isOverdue).length,
      total: scopedInvoices.length
    };
    const pendingRefunds = scopedRefunds.filter((r) => r.status === 'requested' || r.status === 'pending');
    const refundsS = {
      total: scopedRefunds.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      pending: pendingRefunds.length
    };
    const payroll = {
      total: payrollLines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
      count: payrollLines.length
    };
    const rate = Number(settings.taxRate) || 13;
    const tax = { collected: Math.round(payments.total * rate / 100), rate };
    return { payments, invoices: invoicesS, refunds: refundsS, payroll, tax };
  }, [scopedTxns, scopedInvoices, scopedRefunds, payrollLines, settings.taxRate]);

  // ── Tab: transactions ──
  const txnStatuses = useMemo(
    () => ['All', ...[...new Set(txns.map((t) => t.status).filter(Boolean))]],
    [txns]
  );
  const txnRows = useMemo(() => {
    const q = query.toLowerCase();
    return scopedTxns
      .filter((t) => statusFilter === 'All' || t.status === statusFilter)
      .filter((t) => !q || (t.ref || '').toLowerCase().includes(q) || (t.table_name || '').toLowerCase().includes(q) || (t.method || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [scopedTxns, statusFilter, query]);

  // ── Tab: invoices ──
  const invRows = useMemo(() => {
    const q = query.toLowerCase();
    return scopedInvoices
      .filter((i) => statusFilter === 'All' || statusFilter === (isOverdue(i) ? 'Overdue' : i.status))
      .filter((i) => !q || (i.party || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [scopedInvoices, statusFilter, query]);
  const invStatuses = ['All', 'Draft', 'Sent', 'Paid', 'Overdue'];

  // ── Tab: refunds ──
  const refundRows = useMemo(() => {
    const q = query.toLowerCase();
    return scopedRefunds
      .filter((r) => statusFilter === 'All' || r.status === statusFilter)
      .filter((r) => !q || (r.table_name || '').toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [scopedRefunds, statusFilter, query]);

  // ── Tab: taxes (derived per day) ──
  const taxRows = useMemo(() => {
    const rate = Number(settings.taxRate) || 13;
    const byDay = {};
    scopedTxns.filter((t) => t.status === 'Success').forEach((t) => {
      const d = String(t.created_at || '').slice(0, 10);
      if (!d) return;
      byDay[d] = byDay[d] || { day: d, sales: 0, txns: 0 };
      byDay[d].sales += Number(t.amount) || 0;
      byDay[d].txns += 1;
    });
    return Object.values(byDay)
      .map((d) => ({ ...d, tax: Math.round(d.sales * rate / 100), rate }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [scopedTxns, settings.taxRate]);

  const exportCsv = () => {
    if (tab === 'Transactions') {
      downloadCsv(`transactions-${today()}.csv`, [
        ['Ref', 'Date', 'Method', 'Table', 'Status', 'Amount'],
        ...txnRows.map((t) => [t.ref, t.created_at, t.method, t.table_name, t.status, t.amount])
      ]);
    } else if (tab === 'Invoices') {
      downloadCsv(`invoices-${today()}.csv`, [
        ['Invoice', 'Party', 'Due', 'Status', 'Amount'],
        ...invRows.map((i) => [i.id, i.party, i.due_date, i.status, i.amount])
      ]);
    } else if (tab === 'Refunds') {
      downloadCsv(`refunds-${today()}.csv`, [
        ['Date', 'Table', 'Reason', 'Status', 'Amount'],
        ...refundRows.map((r) => [r.created_at, r.table_name, r.reason, r.status, r.amount])
      ]);
    } else if (tab === 'Taxes') {
      downloadCsv(`tax-${today()}.csv`, [
        ['Day', 'Transactions', 'Sales', `VAT ${stats.tax.rate}%`],
        ...taxRows.map((t) => [t.day, t.txns, Math.round(t.sales), t.tax])
      ]);
    } else if (tab === 'Payroll') {
      downloadCsv(`payroll-${today()}.csv`, [
        ['Staff', 'Hours', 'Rate', 'Amount'],
        ...payrollLines.map((l) => [l.staff_name, l.hours, l.hourly_rate, l.amount])
      ]);
    } else {
      downloadCsv(`finance-overview-${today()}.csv`, [
        ['Metric', 'Value'],
        ['Payments settled', stats.payments.total],
        ['Transaction count', stats.payments.count],
        ['Invoices outstanding', stats.invoices.outstanding],
        ['Invoices overdue', stats.invoices.overdue],
        ['Refunds total', stats.refunds.total],
        ['Payroll estimate', stats.payroll.total],
        [`VAT ${stats.tax.rate}% collected`, stats.tax.collected]
      ]);
    }
    toast(`${tab} exported as CSV`, { tone: 'green' });
  };

  const loadingBlock = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-5">
          <span className="block h-3 w-24 animate-pulse rounded bg-canvas" />
          <span className="mt-3 block h-7 w-32 animate-pulse rounded bg-canvas" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Finance" descriptor="Money in, money out, and what the business owes or is owed">
        <SearchInput
          className="w-[220px]"
          placeholder="Search this tab"
          value={query}
          onChange={setQuery} />
        <FilterChips
          ariaLabel="Date range"
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange} />
        <Button variant="dark" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportCsv}>
          Export CSV
        </Button>
      </PageHeader>

      {loadState === 'error' &&
      <div className="mb-4 rounded-xl border border-status-red/30 bg-tint-red px-4 py-3 text-sm font-semibold text-status-red">
          Couldn't reach the server — figures may be incomplete. Refresh to retry.
        </div>
      }

      <div className="mb-6">
        <Tabs options={TABS} value={tab} onChange={(t) => { setTab(t); setStatusFilter('All'); setQuery(''); }} />
      </div>

      {loadState === 'loading' ? loadingBlock : (
        <>
          {tab === 'Overview' &&
          <>
              <StatRow stats={[
              { label: 'Net cash in', value: rs(stats.payments.total - stats.refunds.total), meta: 'payments − refunds' },
              { label: 'Receivables', value: rs(stats.invoices.outstanding), meta: `${stats.invoices.overdue} overdue invoices` },
              { label: 'Refunds out', value: rs(stats.refunds.total), meta: `${stats.refunds.pending} pending` },
              { label: 'VAT to remit', value: rs(stats.tax.collected), meta: `${stats.tax.rate}% of settled sales` }
            ]} />
              <div className="mt-5">
                <OverviewTab stats={stats} onOpen={(action) => {
                const map = {
                  'View transactions': 'Transactions',
                  'View invoices': 'Invoices',
                  'View refunds': 'Refunds',
                  'View payroll': 'Payroll',
                  'View taxes': 'Taxes'
                };
                if (map[action]) setTab(map[action]);
              }} />
              </div>
            </>
          }

          {tab === 'Transactions' &&
          <>
              <div className="mb-4">
                <Tabs options={txnStatuses.slice(0, 5)} value={statusFilter} onChange={setStatusFilter} danger={txnRows.some((t) => t.status === 'Failed') ? 'Failed' : undefined} />
              </div>
              <TableWrap>
                {txnRows.length === 0 ? (
                <EmptyState
                title={query ? `No transactions match "${query}"` : 'No transactions in this period'}
                description="Settled payments appear here the moment they complete."
                action={query ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setStatusFilter('All'); }}>Clear filters</Button> : undefined} />
              ) : (
                <Table>
                    <thead>
                      <tr>
                        <Th>Ref</Th>
                        <Th>Date</Th>
                        <Th>Method</Th>
                        <Th>Table</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {txnRows.map((t) => (
                      <Tr key={t.id} onClick={() => setActive({ kind: 'txn', data: t })}>
                          <Td className="font-mono text-sm font-semibold">{(t.ref || t.id || '').slice(0, 12)}</Td>
                          <Td className="text-sm text-meta">{new Date(t.created_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                          <Td className="text-sm">{t.method}</Td>
                          <Td className="text-sm">{t.table_name || '—'}</Td>
                          <Td><Pill tone={statusTone(t.status)} dot>{t.status}</Pill></Td>
                          <Td className="text-right font-mono text-sm font-bold">{rs(t.amount)}</Td>
                        </Tr>
                    ))}
                    </tbody>
                  </Table>
              )}
              </TableWrap>
            </>
          }

          {tab === 'Invoices' &&
          <>
              <div className="mb-4">
                <Tabs options={invStatuses} value={statusFilter} onChange={setStatusFilter} danger="Overdue" />
              </div>
              <TableWrap>
                {invRows.length === 0 ? (
                <EmptyState
                title={query ? `No invoices match "${query}"` : 'No invoices in this period'}
                description="Corporate and vendor invoices you issue appear here."
                action={query ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setStatusFilter('All'); }}>Clear filters</Button> : undefined} />
              ) : (
                <Table>
                    <thead>
                      <tr>
                        <Th>Invoice</Th>
                        <Th>Party</Th>
                        <Th>Due</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {invRows.map((i) => {
                      const overdue = isOverdue(i);
                      const status = overdue ? 'Overdue' : i.status;
                      return (
                        <Tr key={i.id} onClick={() => setActive({ kind: 'invoice', data: i })}>
                            <Td className="font-mono text-sm font-semibold">{String(i.id).slice(0, 8)}</Td>
                            <Td className="text-sm">{i.party}</Td>
                            <Td className="text-sm text-meta">{i.due_date ? new Date(i.due_date).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '—'}</Td>
                            <Td><Pill tone={statusTone(status)} dot>{status}</Pill></Td>
                            <Td className="text-right font-mono text-sm font-bold">{rs(i.amount)}</Td>
                          </Tr>
                      );
                    })}
                    </tbody>
                  </Table>
              )}
              </TableWrap>
            </>
          }

          {tab === 'Refunds' &&
          <TableWrap>
              {refundRows.length === 0 ? (
              <EmptyState
              title={query ? 'No refunds match your search' : 'No refunds in this period'}
              description="Refund requests raised by staff appear here for the record." />
            ) : (
              <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Table</Th>
                      <Th>Reason</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundRows.map((r) => (
                    <Tr key={r.id} onClick={() => setActive({ kind: 'refund', data: r })}>
                        <Td className="text-sm text-meta">{new Date(r.created_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                        <Td className="text-sm">{r.table_name || '—'}</Td>
                        <Td className="text-sm">{r.reason || '—'}</Td>
                        <Td><Pill tone={statusTone(r.status)} dot>{r.status}</Pill></Td>
                        <Td className="text-right font-mono text-sm font-bold">{rs(r.amount)}</Td>
                      </Tr>
                  ))}
                  </tbody>
                </Table>
            )}
            </TableWrap>
          }

          {tab === 'Payroll' &&
          <>
              <div className="mb-4">
                <SectionHeader
                  index="01"
                  title="Payroll estimate"
                  descriptor="hours × current hourly rate per staff" />
              </div>
              <TableWrap>
              {payrollLines.length === 0 ? (
              <EmptyState
              title="No payroll rates set"
              description="Set hourly rates per staff member in Team — the estimate builds from there."
              action={<Button variant="outline" size="sm" onClick={() => setTab('Overview')}>Back to overview</Button>} />
            ) : (
              <Table>
                    <thead>
                      <tr>
                        <Th>Staff</Th>
                        <Th className="text-right">Hours</Th>
                        <Th className="text-right">Rate (edit)</Th>
                        <Th className="text-right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollLines.map((l) => (
                      <PayrollRateRow key={l.staff_id || l.staff_name} line={l} onSaved={(updated) => {
                        setPayrollLines((prev) => prev.map((x) => (x.staff_id === updated.staff_id ? updated : x)));
                      }} />
                    ))}
                      <Tr>
                        <Td className="font-extrabold">Total</Td>
                        <Td />
                        <Td />
                        <Td className="text-right font-mono text-sm font-extrabold">{rs(stats.payroll.total)}</Td>
                      </Tr>
                    </tbody>
                  </Table>
            )}
              </TableWrap>
          </>
          }

          {tab === 'Taxes' &&
          <TableWrap>
              {taxRows.length === 0 ? (
              <EmptyState
              title="No taxable sales in this period"
              description={`VAT is derived from settled transactions at ${stats.tax.rate}%.`} />
            ) : (
              <Table>
                  <thead>
                    <tr>
                      <Th>Day</Th>
                      <Th className="text-right">Transactions</Th>
                      <Th className="text-right">Sales</Th>
                      <Th className="text-right">{`VAT ${stats.tax.rate}%`}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRows.map((t) => (
                    <Tr key={t.day}>
                        <Td className="font-semibold">{t.day}</Td>
                        <Td className="text-right font-mono text-sm">{t.txns}</Td>
                        <Td className="text-right font-mono text-sm">{rs(t.sales)}</Td>
                        <Td className="text-right font-mono text-sm font-bold">{rs(t.tax)}</Td>
                      </Tr>
                  ))}
                    <Tr>
                      <Td className="font-extrabold">Total</Td>
                      <Td className="text-right font-mono text-sm font-extrabold">{taxRows.reduce((s, t) => s + t.txns, 0)}</Td>
                      <Td className="text-right font-mono text-sm font-extrabold">{rs(taxRows.reduce((s, t) => s + t.sales, 0))}</Td>
                      <Td className="text-right font-mono text-sm font-extrabold">{rs(taxRows.reduce((s, t) => s + t.tax, 0))}</Td>
                    </Tr>
                  </tbody>
                </Table>
            )}
            </TableWrap>
          }
        </>
      )}

      {/* Detail drawers — one per record kind, consistent shape */}
      <DetailDrawer
        open={active?.kind === 'txn'}
        onClose={() => setActive(null)}
        title={active?.kind === 'txn' ? `Transaction ${String(active.data.ref || active.data.id || '').slice(0, 12)}` : ''}
        subtitle={active?.kind === 'txn' ? active.data.method : ''}
        footer={null}>
        {active?.kind === 'txn' &&
        <>
            <dl className="divide-y divide-line">
              <DetailRow label="Amount" value={rs(active.data.amount)} mono tone="green" />
              <DetailRow label="Status" value={<Pill tone={statusTone(active.data.status)} dot>{active.data.status}</Pill>} />
              <DetailRow label="Method" value={active.data.method} />
              <DetailRow label="Table" value={active.data.table_name || '—'} />
              <DetailRow label="Split" value={active.data.split_note || '—'} />
              <DetailRow label="Date" value={new Date(active.data.created_at).toLocaleString('en')} />
            </dl>
          </>
        }
      </DetailDrawer>

      <DetailDrawer
        open={active?.kind === 'invoice'}
        onClose={() => setActive(null)}
        title={active?.kind === 'invoice' ? `Invoice ${String(active.data.id).slice(0, 8)}` : ''}
        subtitle={active?.kind === 'invoice' ? active.data.party : ''}
        footer={null}>
        {active?.kind === 'invoice' &&
        <>
            <dl className="divide-y divide-line">
              <DetailRow label="Amount" value={rs(active.data.amount)} mono tone="green" />
              <DetailRow label="Status" value={<Pill tone={statusTone(isOverdue(active.data) ? 'Overdue' : active.data.status)} dot>{isOverdue(active.data) ? 'Overdue' : active.data.status}</Pill>} />
              <DetailRow label="Due" value={active.data.due_date ? new Date(active.data.due_date).toLocaleDateString('en') : '—'} />
            </dl>
            {active.data.items?.length > 0 &&
          <DetailSection title="Items">
              <div className="overflow-hidden rounded-xl border border-line bg-canvas">
                {active.data.items.map((l, i) => (
                <div key={i} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="min-w-0 truncate text-sm">{l.description} × {l.qty}</span>
                    <span className="shrink-0 font-mono text-sm font-semibold">{rs(l.qty * l.unit_price)}</span>
                  </div>
              ))}
              </div>
            </DetailSection>
          }
          </>
        }
      </DetailDrawer>

      <DetailDrawer
        open={active?.kind === 'refund'}
        onClose={() => setActive(null)}
        title={active?.kind === 'refund' ? 'Refund detail' : ''}
        subtitle={active?.kind === 'refund' ? active.data.table_name || '' : ''}
        footer={null}>
        {active?.kind === 'refund' &&
        <dl className="divide-y divide-line">
            <DetailRow label="Amount" value={rs(active.data.amount)} mono tone="green" />
            <DetailRow label="Status" value={<Pill tone={statusTone(active.data.status)} dot>{active.data.status}</Pill>} />
            <DetailRow label="Reason" value={active.data.reason || '—'} />
            <DetailRow label="Created by" value={active.data.created_by || '—'} />
            <DetailRow label="Date" value={new Date(active.data.created_at).toLocaleString('en')} />
          </dl>
        }
      </DetailDrawer>
    </div>);

}
