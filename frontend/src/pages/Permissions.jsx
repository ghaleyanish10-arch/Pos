import React, { useState, useMemo } from 'react';
import { AlertTriangleIcon, UserPlusIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, GhostCard, Toggle, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';
import { permissionRows, roles, activeSessions } from '../data/admin';

export function Permissions() {
  const toast = useToast();
  const initial = useMemo(() => permissionRows.map((r) => r.grants.map(Boolean)), []);
  const [grants, setGrants] = useState(initial.map((r) => [...r]));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [account, setAccount] = useState({ name: '', email: '', role: 'Cashier' });
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNote, setAccountNote] = useState('');

  const dirty = useMemo(
    () => grants.some((r, i) => r.some((g, j) => g !== initial[i][j])),
    [grants, initial]
  );

  const affected = useMemo(() => {
    const diffs = [];
    permissionRows.forEach((row, i) => {
      roles.forEach((role, j) => {
        if (initial[i][j] && !grants[i][j]) {
          const sessions = activeSessions.filter((s) => s.role === role);
          sessions.forEach((session) => {
            let entry = diffs.find((d) => d.name === session.name);
            if (!entry) {
              entry = { ...session, loses: [] };
              diffs.push(entry);
            }
            entry.loses.push(row.action);
          });
        }
      });
    });
    return diffs;
  }, [grants, initial]);

  const toggle = (row, col) =>
    setGrants((prev) =>
      prev.map((r, i) => (i === row ? r.map((g, j) => (j === col ? !g : g)) : r))
    );

  const handleSave = () => {
    if (affected.length > 0) {
      setDrawerOpen(true);
      return;
    }
    toast.success('Permissions saved');
  };

  const confirmSave = () => {
    setDrawerOpen(false);
    toast.success('Permissions saved');
  };

  const handleDiscard = () => {
    setGrants(initial.map((r) => [...r]));
    toast('Changes discarded');
  };

  // Creates the account via POST /auth/register; the backend emails a real
  // verification link to the address (Resend), pointing back at this app.
  const createAccount = async (e) => {
    e.preventDefault();
    setAccountNote('');
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
        toast(`Account created · email not configured, no verification sent`, { tone: 'amber' });
        setAccountNote('Account created, but the server has no RESEND_API_KEY set — no email was sent.');
      }
      setAccount({ name: '', email: '', role: 'Cashier' });
    } catch (err) {
      toast(err?.message || 'Could not create the account', { tone: 'red' });
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Roles & Permissions" descriptor="4 roles · 11 controlled actions">
        <Button variant="outline" disabled={!dirty} onClick={handleDiscard}>
          Discard changes
        </Button>
        <Button variant="outline" icon={<UserPlusIcon className="h-4 w-4" />} onClick={() => setAccountOpen(true)}>
          Add account
        </Button>
        <Button variant="dark" disabled={!dirty} onClick={handleSave}>
          Save permissions
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Action
                </th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-4 text-center">
                    <button
                      type="button"
                      className="rounded-full border border-line bg-canvas px-3 py-1.5 text-[12px] font-bold text-ink transition-colors duration-150 ease-soft hover:border-ink/40"
                    >
                      {r}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionRows.map((row, i) => {
                const newGroup = i === 0 || permissionRows[i - 1].group !== row.group;
                return (
                  <React.Fragment key={row.action}>
                    {newGroup && (
                      <tr className="bg-canvas">
                        <td
                          colSpan={roles.length + 1}
                          className="px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta"
                        >
                          {row.group}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-line">
                      <td className="px-5 py-3 font-semibold text-ink">{row.action}</td>
                      {roles.map((role, j) => (
                        <td key={role} className="px-4 py-3">
                          <div className="flex justify-center">
                            <Toggle
                              checked={grants[i][j]}
                              onChange={() => toggle(i, j)}
                              label={`${row.action} for ${role}`}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink">
              Role notes
            </h2>
            <p className="mt-2 text-sm text-meta">
              Refund approval above Rs 2,000 always escalates to Corporate Admin, whatever
              this matrix says.
            </p>
          </div>
          <GhostCard label="New role" className="min-h-[120px]" />
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Confirm permission changes"
        subtitle="Staff with active sessions will lose access"
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
        <div className="rounded-xl border border-[#F0D98C] bg-tint-amber px-4 py-3">
          <div className="flex items-start gap-2.5 text-sm font-semibold text-status-amber">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The following staff have active sessions and will be affected:</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {affected.map((s) => (
            <div
              key={s.name}
              className="rounded-xl border border-line bg-canvas px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">
                {s.name.split(' ')[0]} · {s.role}
              </p>
              <p className="mt-1 text-sm text-status-amber">
                loses Access to: {s.loses.join(', ')}
              </p>
            </div>
          ))}
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
            <Button variant="dark" type="submit" form="add-account-form" disabled={accountBusy}>
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
              onChange={(e) => setAccount({ ...account, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={account.role}
              onChange={(e) => setAccount({ ...account, role: e.target.value })}>
              <option>Cashier</option>
              <option>Store Manager</option>
              <option>Inventory Auditor</option>
              <option>Corporate Admin</option>
            </select>
          </Field>
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
