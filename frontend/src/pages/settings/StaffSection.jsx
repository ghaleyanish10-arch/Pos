import { useEffect, useState } from 'react';
import { KeyRoundIcon, MonitorSmartphoneIcon, PowerIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClass } from '../../components/ui/Controls';
import { Pill } from '../../components/ui/Pill';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { useToast } from '../../components/ui/Toast';
import { ConfirmTyped, FieldError } from './settingsKit';
import api from '../../api/client';

// Boss-only: PIN assignment per staff member, and the approved clock-in
// terminals. PINs are write-only (server never returns them) and resetting
// one requires the boss's own password; disabling a terminal sends it back
// to the manager-approval screen.
const WEAK_PINS = ['1234', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1212', '6969', '1122'];

export function StaffSection() {
  const toast = useToast();

  // --- PINs ---
  const [accounts, setAccounts] = useState(null);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinVal, setPinVal] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [bossPassword, setBossPassword] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/staff/pin-accounts')
      .then((res) => { if (!cancelled) setAccounts(res?.data || []); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  const pinErrors = {};
  if (pinVal && !/^\d{4,6}$/.test(pinVal)) pinErrors.pin = 'PIN is 4–6 digits.';
  else if (pinVal && WEAK_PINS.includes(pinVal)) pinErrors.pin = 'That sequence is too easy to guess — pick another.';
  if (pinConfirm && pinVal !== pinConfirm) pinErrors.confirm = 'PINs do not match.';

  const closePin = () => {
    setPinTarget(null);
    setPinVal('');
    setPinConfirm('');
    setBossPassword('');
    setPinError('');
  };

  const submitPIN = async () => {
    if (!pinTarget) return;
    setPinBusy(true);
    setPinError('');
    try {
      await api(`/staff/${pinTarget.id}/pin`, {
        method: 'PUT',
        body: { pin: pinVal.trim(), password: bossPassword }
      });
      toast(`PIN updated for ${pinTarget.name}`, { tone: 'green' });
      setAccounts((prev) => prev?.map((a) => (a.id === pinTarget.id ? { ...a, has_pin: true } : prev)) || []);
      closePin();
    } catch (e) {
      setPinError(e.message || 'PIN update failed — check your password.');
    } finally {
      setPinBusy(false);
    }
  };

  // --- Terminals ---
  const [devices, setDevices] = useState(null);
  const [disabling, setDisabling] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/staff/devices')
      .then((res) => { if (!cancelled) setDevices(res?.data || []); })
      .catch(() => { if (!cancelled) setDevices([]); });
    return () => { cancelled = true; };
  }, []);

  const disableTerminal = async (device) => {
    if (disabling) return;
    setDisabling(device.id);
    try {
      await api(`/staff/devices/${device.id}`, { method: 'DELETE' });
      setDevices((prev) => prev?.filter((d) => d.id !== device.id) || []);
      toast(`Terminal ${device.id.slice(0, 8)}… disabled`, { tone: 'dark' });
    } catch (e) {
      toast(e.message || 'Failed to disable terminal', { tone: 'red' });
    } finally {
      setDisabling(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Staff PINs</h2>
        <p className="mt-1 text-sm text-meta">
          The PIN authorizes single privileged actions on a shared terminal. It never reveals or changes a login password,
          and resetting one requires your own password.
        </p>
        <div className="mt-4">
          {accounts === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-meta"><Spinner className="h-4 w-4" /> Loading accounts…</div>
          ) : accounts.length === 0 ? (
            <EmptyState
              compact
              title="No accounts found"
              description="The staff API returned nothing — check that the backend is running." />
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-canvas">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.name}</p>
                    <p className="text-xs text-meta">{a.role === 'Corporate Admin' ? 'Boss' : a.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={a.has_pin ? 'green' : 'amber'} dot>{a.has_pin ? 'PIN set' : 'No PIN'}</Pill>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPinTarget(a);
                        setPinVal('');
                        setPinConfirm('');
                        setBossPassword('');
                        setPinError('');
                      }}>
                      <KeyRoundIcon className="h-3.5 w-3.5" />
                      {a.has_pin ? 'Reset PIN' : 'Set PIN'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Approved terminals</h2>
        <p className="mt-1 text-sm text-meta">
          Clock-in terminals approved for this branch. Disabling one sends it back to the manager-approval screen.
        </p>
        <div className="mt-4">
          {devices === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-meta"><Spinner className="h-4 w-4" /> Loading terminals…</div>
          ) : devices.length === 0 ? (
            <EmptyState
              compact
              title="No terminals approved yet"
              description="A manager or boss approves a terminal from the clock-in screen — it appears here once approved." />
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-canvas">
              {devices.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                      <MonitorSmartphoneIcon className="h-4 w-4 shrink-0 text-meta" />
                      <span className="font-mono">{d.id}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-meta">
                      Enabled {new Date(d.enabled_at).toLocaleString()} · by {d.enabled_by_name || d.enabled_by_user_id || 'unknown'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={disabling === d.id} onClick={() => setDisabling(d)}>
                    <PowerIcon className="h-3.5 w-3.5" />
                    Disable
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={!!pinTarget}
        onClose={pinBusy ? () => {} : closePin}
        title={`Set PIN · ${pinTarget?.name || ''}`}
        subtitle="4–6 digits. Weak sequences are rejected.">
        <div className="space-y-4">
          {pinError && <AlertBanner tone="red">{pinError}</AlertBanner>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="New PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${inputClass} text-center font-mono tracking-[0.4em]`}
                value={pinVal}
                aria-invalid={!!pinErrors.pin}
                onChange={(e) => setPinVal(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Confirm PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${inputClass} text-center font-mono tracking-[0.4em]`}
                value={pinConfirm}
                aria-invalid={!!pinErrors.confirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          {pinErrors.pin && <FieldError>{pinErrors.pin}</FieldError>}
          {pinErrors.confirm && <FieldError>{pinErrors.confirm}</FieldError>}
          <Field label="Your login password (re-auth)">
            <input
              type="password"
              className={inputClass}
              value={bossPassword}
              onChange={(e) => setBossPassword(e.target.value)}
              placeholder="Confirm your own password to proceed" />
          </Field>
          <p className="text-xs text-meta">
            A stolen boss session alone cannot mint PINs — the password is checked server-side every time.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={closePin} disabled={pinBusy}>Cancel</Button>
          <Button
            variant="dark"
            disabled={pinBusy || !pinVal || !pinConfirm || !bossPassword || Object.keys(pinErrors).length > 0}
            onClick={submitPIN}>
            {pinBusy ? 'Updating…' : 'Update PIN'}
          </Button>
        </div>
      </Dialog>

      <ConfirmTyped
        open={!!disabling && devices?.some((d) => d.id === disabling)}
        onClose={() => setDisabling(null)}
        title="Disable this terminal?"
        body={`Terminal ${disabling?.slice(0, 8)}… will stop accepting staff clock-ins until a manager re-approves it. This cannot be undone from this screen.`}
        confirmWord="disable"
        confirmLabel="Disable terminal"
        busy={!!disabling && !devices?.some((d) => d.id === disabling)}
        onConfirm={() => disableTerminal(devices.find((d) => d.id === disabling))} />
    </div>
  );
}
