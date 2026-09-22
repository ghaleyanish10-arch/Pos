import React, { useMemo, useState } from 'react';
import { LockIcon, SearchIcon, ShieldCheckIcon, UserPlusIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Field, inputClass, Toggle } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';
import { permissionRows, roles, activeSessions } from '../data/admin';

// The one permission that must never be granted below boss level: whoever
// holds it can rewrite the matrix itself.
const BOSS_ONLY_ACTION = 'Manage roles';

const ROLE_META = {
  Cashier: { desc: 'Front counter — register & service', tone: 'blue' },
  'Store Manager': { desc: 'Runs the shift — ops, menu, people', tone: 'amber' },
  'Inventory Auditor': { desc: 'Stock accuracy — count, order, transfer', tone: 'purple' },
  'Corporate Admin': { desc: 'Owner — everything, including roles', tone: 'green' }
};

export function Permissions() {
  const toast = useToast();
  const initial = useMemo(() => permissionRows.map((r) => r.grants.map(Boolean)), []);
  const [grants, setGrants] = useState(initial.map((r) => [...r]));
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [account, setAccount] = useState({ name: '', email: '', role: 'Cashier' });
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNote, setAccountNote] = useState('');
  const [accountError, setAccountError] = useState('');

  const dirty = useMemo(
    () => grants.some((r, i) => r.some((g, j) => g !== initial[i][j])),
    [grants, initial]
  );

  // Per-role change ledger: what each role gains/loses if saved right now.
  const changesByRole = useMemo(() => {
    const map = Object.fromEntries(roles.map((r) => [r, { gains: [], loses: [] }]));
    permissionRows.forEach((row, i) => {
      roles.forEach((role, j) => {
        if (initial[i][j] && !grants[i][j]) map[role].loses.push(row.action);
        if (!initial[i][j] && grants[i][j]) map[role].gains.push(row.action);
      });
    });
    return map;
  }, [grants, initial]);
  const changeCount = useMemo(
    () => roles.reduce((n, r) => n + changesByRole[r].gains.length + changesByRole[r].loses.length, 0),
    [changesByRole]
  );

  const affected = useMemo(() => {
    const diffs = [];
    roles.forEach((role) => {
      const loses = changesByRole[role].loses;
      activeSessions.filter((s) => s.role === role).forEach((session) => {
        let entry = diffs.find((d) => d.name === session.name);
        if (!entry) {
          entry = { ...session, loses: [] };
          diffs.push(entry);
        }
        entry.loses.push(...loses);
      });
    });
    return diffs;
  }, [changesByRole]);

  const toggle = (row, col) =>
    setGrants((prev) =>
      prev.map((r, i) => (i === row ? r.map((g, j) => (j === col ? !g : g)) : r))
    );

  // The boss-only row can never be switched on for a lesser role — the toggle
  // is disabled, not just hidden, so the invariant holds in the DOM too.
  const isLocked = (rowAction, colIdx) =>
    rowAction === BOSS_ONLY_ACTION && roles[colIdx] !== 'Corporate Admin';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return permissionRows.map((row, i) => ({ row, i }));
    return permissionRows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.action.toLowerCase().includes(q) || row.group.toLowerCase().includes(q));
  }, [query]);

  const handleSave = () => {
    if (affected.length > 0) {
      setDrawerOpen(true);
      return;
    }
    setGrants(initial.map((r) => [...r]));
    toast.success(`Permissions saved · ${changeCount} change${changeCount === 1 ? '' : 's'}`);
  };

  const confirmSave = () => {
    setDrawerOpen(false);
    setGrants(initial.map((r) => [...r]));
    toast.success(`Permissions saved · ${changeCount} change${changeCount === 1 ? '' : 's'}`);
  };

  const handleDiscard = () => {
    setGrants(initial.map((r) => [...r]));
    toast('Changes discarded');
  };

  // Creates the account via POST /auth/register; the backend emails a real
  // verification link to the address, pointing back at this app.
  const createAccount = async (e) => {
    e.preventDefault();
    setAccountNote('');
    setAccountError('');
    setAccountBusy(true);
    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          name: account.name.trim(),
          email: account.email.trim(),
          password: 'Welcome#2026',
          role: account.role,
          branch_id: ''
        }
      });
      if (res?.email_verification_sent) {
        toast.success(`Account created · verification email sent to ${account.email.trim()}`);
        setAccountNote(`Verification email sent to ${account.email.trim()} — the link opens back in this app.`);
      } else {
        toast('Account created · email not configured, no verification sent', { tone: 'amber' });
        setAccountNote('Account created, but the server has no RESEND_API_KEY set — no email was sent.');
      }
      setAccount({ name: '', email: '', role: 'Cashier' });
    } catch (err) {
      setAccountError(err?.message || 'Could not create the account — is the email already registered?');
      toast(err?.message || 'Could not create the account', { tone: 'red' });
    } finally {
      setAccountBusy(false);
    }
  };

  const accountEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim());

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Roles & Permissions" descriptor={`${roles.length} roles · ${permissionRows.length} controlled actions`}>
        <Button variant="outline" disabled={!dirty} onClick={handleDiscard}>
          Discard{changeCount > 0 ? ` (${changeCount})` : ''}
        </Button>
        <Button variant="outline" icon={<UserPlusIcon className="h-4 w-4" />} onClick={() => setAccountOpen(true)}>
          Add account
        </Button>
        <Button variant="dark" disabled={!dirty} onClick={handleSave}>
          Save permissions{changeCount > 0 ? ` (${changeCount})` : ''}
        </Button>
      </PageHeader>

      {/* Role identity cards — who a role is before what it can do */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const meta = ROLE_META[role] || { desc: '', tone: 'neutral' };
          const changes = changesByRole[role];
          const n = changes.gains.length + changes.loses.length;
          return (
            <div
              key={role}
              className={`rounded-card border px-4 py-3.5 transition-colors duration-150 ease-soft ${
                n > 0 ? 'border-status-amber/40 bg-tint-amber' : 'border-line bg-surface'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
                  <ShieldCheckIcon className="h-4 w-4 text-meta" />
                  {role}
                </p>
                {n > 0 && <Pill tone="amber" dot>{n} pending</Pill>}
              </div>
              <p className="mt-1 text-xs text-meta">{meta.desc}</p>
              {n > 0 && (
                <p className="mt-1.5 text-xs font-semibold text-status-amber">
                  +{changes.gains.length} · −{changes.loses.length} on save
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" aria-hidden="true" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Search actions or groups…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search permissions" />
            </div>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-semibold text-meta underline underline-offset-2 hover:text-ink">
                Clear — show all {permissionRows.length}
              </button>
            )}
          </div>

          <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-5 py-4 text-left text-caption font-semibold text-meta">
                    Action
                  </th>
                  {roles.map((r) => (
                    <th key={r} className="px-4 py-4 text-center">
                      <span className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-ink">
                        {r}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={roles.length + 1}>
                      <EmptyState
                        compact
                        title={`No actions match "${query}"`}
                        description="Try a different word, or clear the search to see all controlled actions."
                        action={<Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button>} />
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ row, i }, idx) => {
                    const prev = filtered[idx - 1]?.row;
                    const newGroup = !prev || prev.group !== row.group;
                    return (
                      <React.Fragment key={row.action}>
                        {newGroup && (
                          <tr className="bg-canvas">
                            <td
                              colSpan={roles.length + 1}
                              className="px-5 py-2 text-caption font-semibold text-meta">
                              {row.group}
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-line">
                          <td className="px-5 py-3 font-semibold text-ink">{row.action}</td>
                          {roles.map((role, j) => {
                            const locked = isLocked(row.action, j);
                            return (
                              <td key={role} className="px-4 py-3">
                                <div className="flex justify-center">
                                  {locked ? (
                                    <span
                                      title={`${role} can never hold "${BOSS_ONLY_ACTION}"`}
                                      className="flex h-6 w-11 items-center justify-center rounded-full border border-line bg-canvas text-meta">
                                      <LockIcon className="h-3 w-3" />
                                    </span>
                                  ) : (
                                    <Toggle
                                      checked={grants[i][j]}
                                      onChange={() => toggle(i, j)}
                                      label={`${row.action} for ${role}`} />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-xs font-semibold text-ink">
              Hard rules
            </h2>
            <ul className="mt-2 space-y-2 text-sm text-meta">
              <li>Refund approval above Rs 2,000 always escalates to Corporate Admin, whatever this matrix says.</li>
              <li>"{BOSS_ONLY_ACTION}" is locked to the Corporate Admin column — it can never be granted below boss level.</li>
              <li>Discounts above the configured threshold require a manager PIN at the register, even when the role is allowed.</li>
            </ul>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-xs font-semibold text-ink">
              New role
            </h2>
            <p className="mt-2 text-sm text-meta">
              Custom roles are on the roadmap. Until then, the four above cover the org chart.
            </p>
          </div>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Confirm permission changes"
        subtitle={`${changeCount} change${changeCount === 1 ? '' : 's'} across ${affected.length || 'no'} active session${affected.length === 1 ? '' : 's'}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="dark" onClick={confirmSave}>
              Confirm save
            </Button>
          </>
        }
      >
        {affected.length === 0 ? (
          <AlertBanner tone="green">
            No active staff session loses access — safe to apply.
          </AlertBanner>
        ) : (
          <AlertBanner tone="amber">
            The following staff have active sessions and will be affected:
          </AlertBanner>
        )}

        <div className="mt-4 space-y-3">
          {affected.map((s) => (
            <div
              key={s.name}
              className="rounded-xl border border-line bg-canvas px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">
                {s.name.split(' ')[0]} · {s.role}
              </p>
              <p className="mt-1 text-sm text-status-red">
                loses access to: {s.loses.join(', ')}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-semibold text-ink">Everything being saved</h3>
          {roles.map((role) => {
            const { gains, loses } = changesByRole[role];
            if (gains.length === 0 && loses.length === 0) return null;
            return (
              <div key={role} className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{role}</p>
                {gains.length > 0 && (
                  <p className="mt-1 text-status-green">+ gains: {gains.join(', ')}</p>
                )}
                {loses.length > 0 && (
                  <p className="mt-1 text-status-red">− loses: {loses.join(', ')}</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-meta">
          Affected staff will see a permissions update on their next action.
        </p>
      </Drawer>

      <Drawer
        open={accountOpen}
        onClose={() => !accountBusy && setAccountOpen(false)}
        title="Add account"
        subtitle="Creates the login and emails the verification link"
        footer={
          <>
            <Button variant="outline" onClick={() => setAccountOpen(false)} disabled={accountBusy}>
              Cancel
            </Button>
            <Button variant="dark" type="submit" form="add-account-form" disabled={accountBusy || !account.name.trim() || !accountEmailValid}>
              {accountBusy ? 'Creating…' : 'Create account & send email'}
            </Button>
          </>
        }>
        <form id="add-account-form" className="space-y-4" onSubmit={createAccount}>
          <Field label="Full name">
            <input
              className={inputClass}
              required
              placeholder="e.g. Anjal Shrestha"
              value={account.name}
              onChange={(e) => setAccount({ ...account, name: e.target.value })} />
          </Field>
          <Field label="Email (a real inbox — Gmail/Outlook works)">
            <input
              className={inputClass}
              type="email"
              required
              placeholder="colleague@gmail.com"
              value={account.email}
              aria-invalid={account.email.trim() !== '' && !accountEmailValid}
              onChange={(e) => setAccount({ ...account, email: e.target.value })} />
            {account.email.trim() !== '' && !accountEmailValid && (
              <p className="mt-1 text-xs font-semibold text-status-red">That doesn't look like an email address.</p>
            )}
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={account.role}
              onChange={(e) => setAccount({ ...account, role: e.target.value })}>
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          {accountError && <AlertBanner tone="red">{accountError}</AlertBanner>}
          {accountNote &&
          <p className="rounded-xl border border-status-green/30 bg-tint-green/40 px-3 py-2 text-xs font-semibold text-status-green">
              {accountNote}
            </p>
          }
          <p className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-meta">
            A temporary password (Welcome#2026) is set — the emailed verification link is what
            proves the address. The user should change the password after signing in.
          </p>
        </form>
      </Drawer>
    </div>
  );
}
