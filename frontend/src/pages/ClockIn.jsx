import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock3Icon, DeleteIcon, LogInIcon, Settings2Icon, ShieldCheckIcon, XIcon } from 'lucide-react';
import { api, getDeviceId } from '../api/client';
import { frontendRole, ROLES, useRole } from '../state/RoleContext';
import { BrandLogo } from '../components/auth/AuthChrome';

function roleMeta(role) {
  const r = ROLES[frontendRole(role)];
  return { initials: r.initials, label: r.label };
}

export function ClockIn() {
  const { clockIn } = useRole();
  const [roster, setRoster] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [enabled, setEnabled] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [selected, setSelected] = useState(null);
  const [pins, setPins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [now, setNow] = useState(new Date());
  const [email, setEmail] = useState('');
  const [emailSetup, setEmailSetup] = useState(false);
  const [branch, setBranch] = useState(() => localStorage.getItem('mesa_terminal_branch') || '');
  const [branchOptions, setBranchOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // A terminal that was previously approved remembers its branch and
        // can re-declare it when the approvers list is needed (e.g. after a
        // boss disables it). A brand-new terminal sends none — and gets NO
        // cross-tenant approver list, only first-run setup (see below).
        const cachedBranch = localStorage.getItem('mesa_terminal_branch') || '';
        const status = await api(
          '/staff/terminal-status' + (cachedBranch ? `?branch_id=${cachedBranch}` : '')
        );
        if (!alive) return;
        setEnabled(Boolean(status?.enabled));
        setApprovers(status?.approvers || []);
        if (status?.enabled) {
          try {
            const res = await api('/staff/roster');
            if (alive) setRoster(res?.data || []);
          } catch (e) {
            if (alive && (e.status === 403 || e.status === 409)) {
              // Terminal is approved but not bound to a branch yet — setup
              // state, not a roster.
              setEnabled(false);
              setApprovers([]);
            } else if (alive) {
              setFatal('Could not reach the server. Check the terminal connection.');
            }
          }
        }
      } catch (e) {
        if (alive) {
          setFatal('Could not reach the server. Check the terminal connection.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    // Branch picker (id + name only) for first-run setup: the operator must
    // declare which branch this terminal serves before it can be approved.
    // Best-effort — a failed fetch degrades to the cached branch.
    api('/staff/branches')
      .then((branches) => {
        if (alive) setBranchOptions(branches?.data || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const press = (d) => {
    if (pins.length < 4) {
      setPins((p) => p + d);
      setError('');
    }
  };

  const backspace = () => setPins((p) => p.slice(0, -1));

  const submit = async () => {
    if (!enabled && !selected && !(emailSetup && email.trim())) return;
    if (!enabled && !branch) {
      setError('Choose the branch this terminal serves first.');
      setShake((s) => s + 1);
      return;
    }
    if (pins.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      if (enabled) {
        await clockIn(selected.id, pins);
      } else {
        const body = selected
          ? { user_id: selected.id, pin: pins, device_id: getDeviceId(), branch_id: branch }
          : { email: email.trim(), pin: pins, device_id: getDeviceId(), branch_id: branch };
        const res = await api('/staff/terminal-enable', { method: 'POST', body });
        // Remember this terminal's branch so the setup screen can show its
        // own approvers even after a re-approval, and the roster stays scoped.
        if (res?.device?.branch_id) {
          localStorage.setItem('mesa_terminal_branch', res.device.branch_id);
        }
        // Approved: continue straight into the normal clock-in roster, no reload.
        let rosterData = res?.roster || [];
        try {
          const roster = await api('/staff/roster');
          rosterData = roster?.data || [];
        } catch (_) {
          // roster fetch is best-effort here; the terminal is now enabled
        }
        setRoster(rosterData);
        setEnabled(true);
        setSetupOpen(false);
        setSelected(null);
        setEmailSetup(false);
        setPins('');
        setBusy(false);
      }
    } catch (e) {
      setError(
        e.code === 'TERMINAL_BRANCH_MISMATCH'
          ? 'That account belongs to a different branch than the one this terminal is set to. Pick the right branch and try again.'
          : e.code === 'TERMINAL_BRANCH_REQUIRED'
            ? 'Choose the branch this terminal serves first.'
            : e.status === 423
              ? 'PIN locked after too many attempts. Ask a manager to reset it.'
              : e.status === 403
                ? 'Only a manager or boss can approve this terminal.'
                : e.status === 401
                  ? 'That PIN did not match. Try again.'
                  : e.status === 409
                    ? 'This terminal is not linked to a branch yet — ask a branch manager to approve it.'
                    : e.status === 400
                      ? 'Your account is not linked to a branch — a branch manager must approve this terminal.'
                      : (e.message || 'Could not reach the server — check the terminal connection.')
      );
      setShake((s) => s + 1);
      setPins('');
      setBusy(false);
    }
  };

  const cancel = () => {
    setSelected(null);
    setEmailSetup(false);
    setEmail('');
    setPins('');
    setError('');
  };

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const pickHeading = enabled
    ? 'Who is using this terminal?'
    : 'Who is approving this terminal?';
  const grid = enabled ? roster : approvers;
  const emptyText = enabled
    ? 'No staff is set up to clock in yet.'
    : 'No managers or bosses have accounts yet.';

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-4 lg:px-8">
        <BrandLogo
          title={<>Mesa OS <span className="font-medium text-meta">· staff terminal</span></>}
          subtitle={enabled ? 'Pick who you are, then enter your PIN' : 'A manager or boss must approve this terminal first'} />
        <div className="hidden items-center gap-2 text-sm font-semibold text-meta sm:flex">
          <Clock3Icon className="h-4 w-4" />
          {hours}:{minutes}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 py-8 lg:flex-row lg:items-start lg:gap-12">
        {loading ? (
          <p className="text-sm text-meta">Checking terminal…</p>
        ) : fatal ? (
          <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
            <ShieldCheckIcon className="h-8 w-8 text-meta" />
            <p className="text-sm font-semibold text-ink">{fatal}</p>
          </div>
        ) : enabled === false && !selected && !emailSetup && !setupOpen ? (
          <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
            <ShieldCheckIcon className="h-8 w-8 text-meta" />
            <p className="text-sm font-semibold text-ink">
              This terminal hasn't been approved for this branch yet.
            </p>
            <p className="text-caption leading-relaxed text-meta">
              {approvers.length === 0
                ? 'This terminal is not linked to a branch, so approvers can\'t be listed here. Choose the branch and approve it from the terminal by entering a Store Manager or boss account email.'
                : 'A manager or boss needs to approve this terminal before staff can clock in here.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSetupOpen(true);
                setEmailSetup(approvers.length === 0);
              }}
              className="btn btn-primary btn-lg mt-1">
              <Settings2Icon className="h-4 w-4" /> Set up this terminal
            </button>
          </div>
        ) : selected || (emailSetup && email) ? (
          <motion.section
            key={selected.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-caption font-semibold text-meta">
                {enabled ? 'Enter PIN to clock in' : 'Enter PIN to approve this terminal'}
              </h2>
              <button
                type="button"
                onClick={cancel}
                className="flex h-8 items-center gap-1 rounded-lg text-caption font-semibold text-meta transition-colors hover:text-ink">
                <XIcon className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/5 text-sm font-bold text-ink">
                  {(selected?.name || email)
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{selected?.name || email}</p>
                  <p className="text-caption text-meta">
                    {emailSetup ? 'Account email' : roleMeta(selected.role).label}
                  </p>
                </div>
              </div>

              <motion.div
                key={shake}
                animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.35 }}
                className="mb-5"
                aria-live="polite">
                <div className="mb-2 flex h-12 items-center justify-center gap-2.5 rounded-xl bg-canvas">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-3 w-3 rounded-full transition-colors duration-100 ${
                        i < pins.length ? 'bg-ink' : 'bg-line'
                      } ${i === pins.length && pins.length < 4 ? 'ring-2 ring-ink/25' : ''}`}
                    />
                  ))}
                </div>
                <div className="h-4 text-center">
                  {error && <p className="text-caption font-semibold text-status-red">{error}</p>}
                </div>
              </motion.div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => (k === 'clear' ? setPins('') : k === 'del' ? backspace() : press(k))}
                    className={`flex h-14 items-center justify-center rounded-xl text-lg font-semibold transition-colors duration-100 ease-soft ${
                      k === 'clear' || k === 'del'
                        ? 'bg-canvas text-meta hover:text-ink'
                        : 'bg-canvas text-ink hover:bg-line'
                    }`}>
                    {k === 'del' ? <DeleteIcon className="h-5 w-5" /> : k === 'clear' ? 'C' : k}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={pins.length < 4 || busy}
                onClick={submit}
                className="btn btn-primary btn-lg mt-4 w-full">
                {busy ? (enabled ? 'Checking…' : 'Approving…') : (
                  <>
                    <LogInIcon className="h-4 w-4" /> {enabled ? 'Clock in' : 'Approve terminal'}
                  </>
                )}
              </button>
            </div>
          </motion.section>
        ) : !enabled && approvers.length === 0 ? (
          <section className="w-full max-w-sm">
            <h2 className="mb-3 text-caption font-semibold text-meta">
              This terminal isn't linked to a branch yet
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="mb-4 text-caption leading-relaxed text-meta">
                Choose the branch this terminal serves, then enter the work
                email of the account that will approve it (a Store Manager or
                the boss). The account must belong to that branch.
              </p>
              <label className="mb-2 block text-caption font-semibold text-meta">
                Branch
              </label>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setError('');
                }}
                className="mb-4 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none focus:border-ink/40">
                <option value="">Choose a branch…</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none focus:border-ink/40"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="manager@yourplace.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email.trim() && branch) setEmailSetup(true);
                }}
                autoFocus />
              {error && (
                <p className="mt-2 text-caption font-semibold text-status-red">{error}</p>
              )}
              <button
                type="button"
                disabled={!email.trim() || !branch || busy}
                onClick={() => setEmailSetup(true)}
                className="btn btn-primary btn-lg mt-4 w-full">
                Continue
              </button>
              <button
                type="button"
                onClick={cancel}
                className="btn btn-ghost btn-lg mt-2 w-full">
                Cancel
              </button>
            </div>
          </section>
        ) : (
          <section className="w-full max-w-2xl">
            <h2 className="mb-3 text-caption font-semibold text-meta">
              {pickHeading}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {grid.length === 0 && (
                <p className="col-span-full text-sm text-meta">{emptyText}</p>
              )}
              {grid.map((u) => {
                const m = roleMeta(u.role);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelected(u);
                      setPins('');
                      setError('');
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center transition-colors duration-150 ease-soft hover:border-ink/30 hover:bg-canvas">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/5 text-sm font-bold text-ink">
                      {u.name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-ink">{u.name}</span>
                    <span className="text-caption text-meta">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-caption text-meta">
              {grid.length} staff member{grid.length === 1 ? '' : 's'}
            </p>
          </section>
        )}
      </main>

      <footer className="border-t border-line px-6 py-3 text-center text-caption text-meta">
        Mesa OS shared terminal · sessions expire automatically after{" "}
        {Math.max(1, Number(localStorage.getItem('mesa_idle_min')) || Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN) || 15)} min of inactivity
      </footer>
    </div>
  );
}