import { useEffect, useMemo, useState } from 'react';
import { CalendarPlusIcon, ClockIcon, DownloadIcon, UsersIcon, WalletIcon } from 'lucide-react';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { Field, inputClass } from '../components/ui/Controls';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';

const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;

// Restronp color language: green = paid, amber = awaiting approval, red = nothing here.
const STATUS_TONE = { paid: 'green', approved: 'blue', draft: 'amber' };
const STATUS_NEXT = { draft: 'approved', approved: 'paid' };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function StatCard({ icon, label, value, tone = 'ink' }) {
  const tint = { ink: 'bg-canvas text-ink', green: 'bg-tint-green text-status-green', amber: 'bg-tint-amber text-status-amber' }[tone];
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-caption font-semibold text-meta">{label}</p>
        <p className="mt-1 truncate font-mono text-xl font-extrabold tracking-tight text-ink">{value}</p>
      </div>
    </Card>
  );
}

export function Payroll() {
  const toast = useToast();
  const [rates, setRates] = useState(null); // [{staff_id, staff_name, hours, hourly_rate, amount}]
  const [periods, setPeriods] = useState(null);
  const [openPeriod, setOpenPeriod] = useState(null); // period with lines
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ label: '', start_date: daysAgo(6), end_date: today() });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api('/payroll/rates').then((res) => setRates(res?.data || [])).catch(() => setRates([]));
    api('/payroll/periods').then((res) => setPeriods(res?.data || [])).catch(() => setPeriods([]));
  };
  useEffect(load, []);

  const totals = useMemo(() => {
    const list = rates || [];
    return {
      payroll: list.reduce((s, l) => s + l.amount, 0),
      hours: list.reduce((s, l) => s + l.hours, 0),
      staff: list.length
    };
  }, [rates]);

  const createPeriod = async () => {
    if (!draft.label.trim() || !draft.start_date || !draft.end_date) return;
    const lines = (rates || []).map((l) => ({
      staff_id: l.staff_id,
      staff_name: l.staff_name,
      hours: l.hours,
      hourly_rate: l.hourly_rate
    }));
    setBusy(true);
    try {
      await api('/payroll/periods', {
        method: 'POST',
        body: { ...draft, label: draft.label.trim(), lines }
      });
      toast(`Payroll period “${draft.label.trim()}” created as draft`, { tone: 'green' });
      setCreateOpen(false);
      setDraft({ label: '', start_date: daysAgo(6), end_date: today() });
      load();
    } catch (e) {
      toast(e.message || 'Failed to create payroll period', { tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const advanceStatus = async (period) => {
    const next = STATUS_NEXT[period.status];
    if (!next) return;
    try {
      await api(`/payroll/periods/${period.id}/status`, { method: 'PUT', body: { status: next } });
      setPeriods((prev) => prev?.map((p) => (p.id === period.id ? { ...p, status: next } : p)) || []);
      toast(`Period marked ${next}`, { tone: next === 'paid' ? 'green' : 'neutral' });
    } catch (e) {
      toast(e.message || 'Failed to update period', { tone: 'red' });
    }
  };

  const openLines = async (period) => {
    try {
      const res = await api(`/payroll/periods/${period.id}`);
      setOpenPeriod(res?.data || period);
    } catch {
      setOpenPeriod(period); // list without lines beats a dead modal
    }
  };

  const exportCsv = () => {
    const rows = [['Staff', 'Hours', 'Hourly rate', 'Amount']]
      .concat((rates || []).map((l) => [l.staff_name, l.hours, l.hourly_rate, l.amount]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Payroll exported as CSV', { tone: 'neutral' });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Payroll"
        descriptor="Hours × rate per pay period · manager only">
        <Button variant="outline" onClick={exportCsv} disabled={!rates || rates.length === 0}>
          <DownloadIcon className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <Button variant="dark" onClick={() => setCreateOpen(true)} disabled={!rates || rates.length === 0}>
          <CalendarPlusIcon className="h-4 w-4 mr-2" />
          New pay period
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard icon={<WalletIcon className="h-5 w-5" />} label="Total payroll (this week)" value={rs(totals.payroll)} tone="green" />
        <StatCard icon={<ClockIcon className="h-5 w-5" />} label="Total scheduled hours" value={`${totals.hours}h`} />
        <StatCard icon={<UsersIcon className="h-5 w-5" />} label="Staff on payroll" value={totals.staff} />
      </div>

      <section className="mb-6">
        <SectionHeader index="01" title="Current rates" descriptor="Hours are this week's schedule; edit rates from a staff member's profile or the Team drawer" />
        <Card>
          {rates === null ? (
            <p className="text-sm text-meta">Loading payroll…</p>
          ) : rates.length === 0 ? (
            <EmptyState
              compact
              icon={<WalletIcon className="h-6 w-6" />}
              title="No hourly rates set"
              description="Add an hourly rate to a staff member in Team, then their pay line shows up here."
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-caption font-semibold text-meta">
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3 text-right">Hours</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((l) => (
                    <tr key={l.staff_id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-ink">{l.staff_name}</td>
                      <td className="px-4 py-3 text-right font-mono text-meta">{l.hours}h</td>
                      <td className="px-4 py-3 text-right font-mono text-meta">{rs(l.hourly_rate)}/h</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-ink">{rs(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line">
                    <td className="px-4 py-3 font-extrabold text-ink">Total</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink">{totals.hours}h</td>
                    <td />
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-ink">{rs(totals.payroll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader index="02" title="Pay periods" descriptor="Draft → approved → paid — snapshots survive later rate edits" />
        <Card>
          {periods === null ? (
            <p className="text-sm text-meta">Loading periods…</p>
          ) : periods.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarPlusIcon className="h-6 w-6" />}
              title="No pay periods yet"
              description="Snapshot this week's hours and rates into a period to start the payroll trail."
            />
          ) : (
            <ul className="divide-y divide-line">
              {periods.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{p.label}</span>
                    <span className="block text-xs text-meta">
                      {p.start_date} → {p.end_date}
                    </span>
                  </span>
                  <Pill tone={STATUS_TONE[p.status] || 'amber'} dot>
                    {p.status}
                  </Pill>
                  <Button size="sm" variant="outline" onClick={() => openLines(p)}>
                    View
                  </Button>
                  {STATUS_NEXT[p.status] && (
                    <Button size="sm" variant="dark" onClick={() => advanceStatus(p)}>
                      Mark {STATUS_NEXT[p.status]}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New pay period"
        subtitle="Snapshots current hours × rate per staff"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="dark"
              onClick={createPeriod}
              disabled={busy || !draft.label.trim()}
              >
              {busy ? 'Creating…' : 'Create draft period'}
            </Button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Label">
            <input
              className={inputClass}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. Week Sep 7–13" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                className={inputClass}
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className={inputClass}
                value={draft.end_date}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </Field>
          </div>
          <p className="rounded-xl border border-status-green/25 bg-tint-green px-3 py-2.5 text-xs font-semibold text-status-green">
            {(rates || []).length} staff × hours × rate will be frozen into this period.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={!!openPeriod}
        onClose={() => setOpenPeriod(null)}
        title={openPeriod?.label || 'Pay period'}
        subtitle={openPeriod ? `${openPeriod.start_date} → ${openPeriod.end_date}` : ''}
        footer={
          <Button variant="dark" full onClick={() => setOpenPeriod(null)}>Done</Button>
        }>
        {openPeriod?.lines?.length ? (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-caption font-semibold text-meta">
                  <th className="py-2">Staff</th>
                  <th className="py-2 text-right">Hours</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {openPeriod.lines.map((l) => (
                  <tr key={l.id || l.staff_id} className="border-b border-line last:border-b-0">
                    <td className="py-2 font-semibold text-ink">{l.staff_name}</td>
                    <td className="py-2 text-right font-mono text-meta">{l.hours}h</td>
                    <td className="py-2 text-right font-mono text-meta">{rs(l.hourly_rate)}</td>
                    <td className="py-2 text-right font-mono font-bold text-ink">{rs(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between rounded-xl bg-canvas px-3 py-2.5">
              <span className="text-sm font-extrabold text-ink">Period total</span>
              <span className="font-mono text-sm font-extrabold text-ink">
                {rs(openPeriod.lines.reduce((s, l) => s + l.amount, 0))}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-meta">No line items stored on this period.</p>
        )}
      </Dialog>
    </div>
  );
}
