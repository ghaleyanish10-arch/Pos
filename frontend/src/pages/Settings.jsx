import { useEffect, useState } from 'react';
import { ClockIcon, EyeIcon, KeyRoundIcon, MapPinIcon, MonitorSmartphoneIcon, PowerIcon, RefreshCcwIcon, SaveIcon, StoreIcon } from 'lucide-react';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Controls';
import { Dialog } from '../components/ui/Dialog';
import { Pill } from '../components/ui/Pill';
import { useToast } from '../components/ui/Toast';
import { DEFAULT_SETTINGS, useSettings } from '../state/SettingsContext';
import api from '../api/client';

export function Settings() {
  const { settings, update, reset } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState(settings);
  const [previewOpen, setPreviewOpen] = useState(false);

  const set = (key) => (e) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const handleSave = () => {
    update(draft);
    toast('Store settings saved', { tone: 'green' });
  };

  const handleReset = () => {
    setDraft(DEFAULT_SETTINGS);
    reset();
    toast('Settings reset to defaults', { tone: 'dark' });
  };

  // --- PIN management (boss only) ---
  const [accounts, setAccounts] = useState(null);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinVal, setPinVal] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [bossPassword, setBossPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/staff/pin-accounts')
      .then((res) => { if (!cancelled) setAccounts(res?.data || []); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  const submitPIN = async () => {
    if (!pinTarget) return;
    if (pinVal !== pinConfirm) {
      toast('PINs do not match', { tone: 'red' });
      return;
    }
    try {
      await api(`/staff/${pinTarget.id}/pin`, {
        method: 'PUT',
        body: { pin: pinVal.trim(), password: bossPassword },
      });
      toast(`PIN updated for ${pinTarget.name}`, { tone: 'green' });
      setAccounts((prev) => prev?.map((a) => (a.id === pinTarget.id ? { ...a, has_pin: true } : prev)));
      setPinTarget(null);
      setPinVal('');
      setPinConfirm('');
      setBossPassword('');
    } catch (e) {
      toast(e.message || 'PIN update failed', { tone: 'red' });
    }
  };

  // --- Approved terminals (boss only) ---
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
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Settings" descriptor="Store profile · boss only">
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <EyeIcon className="h-4 w-4 mr-2" />
          Preview
          {dirty &&
          <span className="ml-2 h-2 w-2 rounded-full bg-status-amber" aria-label="Unsaved changes" />
          }
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RefreshCcwIcon className="h-4 w-4 mr-2" />
          Reset to defaults
        </Button>
        <Button variant="dark" onClick={handleSave}>
          <SaveIcon className="h-4 w-4 mr-2" />
          Save changes
        </Button>
      </PageHeader>

      <div className="space-y-7">
          <section>
            <SectionHeader index="01" title="Store identity" descriptor="Used across the dashboard, receipts and the storefront" />
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name">
                  <input className={inputClass} value={draft.name} onChange={set('name')} placeholder="Mesa" />
                </Field>
                <Field label="Online storefront name">
                  <input className={inputClass} value={draft.businessName} onChange={set('businessName')} placeholder="Thamel House" />
                </Field>
                <Field label="Currency symbol">
                  <input className={inputClass} value={draft.currency} onChange={set('currency')} placeholder="Rs" />
                </Field>
                <Field label="Email (order notifications)">
                  <input className={inputClass} value={draft.email} onChange={set('email')} />
                </Field>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader index="02" title="Contact & location" descriptor="Displayed on receipts, invoices and guest communications" />
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Address">
                  <input className={inputClass} value={draft.address} onChange={set('address')} />
                </Field>
                <Field label="City">
                  <input className={inputClass} value={draft.city} onChange={set('city')} />
                </Field>
                <Field label="Phone">
                  <input className={inputClass} value={draft.phone} onChange={set('phone')} />
                </Field>
                <Field label="VAT / PAN number">
                  <input className={inputClass} value={draft.vatNo} onChange={set('vatNo')} />
                </Field>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader index="03" title="Receipt & taxes" descriptor="Line items and totals on orders and purchase orders" />
            <Card>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Tax name">
                  <input className={inputClass} value={draft.taxName} onChange={set('taxName')} />
                </Field>
                <Field label="Tax rate %">
                  <input type="number" className={inputClass} value={draft.taxRate} onChange={set('taxRate')} />
                </Field>
                <Field label="Service charge %">
                  <input type="number" className={inputClass} value={draft.serviceCharge} onChange={set('serviceCharge')} />
                </Field>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader index="05" title="Manager PINs" descriptor="Boss only · the PIN authorizes single privileged actions; it never reveals or changes login passwords" />
            <Card>
              {accounts === null ? (
                <p className="text-sm text-meta">Loading accounts…</p>
              ) : accounts.length === 0 ? (
                <p className="text-sm text-meta">No accounts found (API offline?).</p>
              ) : (
                <div className="divide-y divide-line">
                  {accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 py-3">
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
                          }}>
                          <KeyRoundIcon className="h-3.5 w-3.5" />
                          {a.has_pin ? 'Reset PIN' : 'Set PIN'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-meta">
                PINs are never readable — only overwrite. Resetting requires your own login password.
              </p>
            </Card>
          </section>

          <section>
            <SectionHeader index="06" title="Terminals" descriptor="Boss only · approved clock-in terminals — disabling one sends it back to the setup screen" />
            <Card>
              {devices === null ? (
                <p className="text-sm text-meta">Loading terminals…</p>
              ) : devices.length === 0 ? (
                <p className="text-sm text-meta">No terminals approved yet. A manager or boss approves one from the clock-in screen.</p>
              ) : (
                <div className="divide-y divide-line">
                  {devices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                          <MonitorSmartphoneIcon className="h-4 w-4 shrink-0 text-meta" />
                          <span className="font-mono">{d.id}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-meta">
                          Enabled {new Date(d.enabled_at).toLocaleString()} · by {d.enabled_by_name || d.enabled_by_user_id || 'unknown'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabling === d.id}
                        onClick={() => disableTerminal(d)}>
                        <PowerIcon className="h-3.5 w-3.5" />
                        Disable
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <section>
            <SectionHeader index="04" title="Opening hours" descriptor="Shown as open / closed on the storefront" />
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Opens">
                  <input type="time" className={inputClass} value={draft.opening} onChange={set('opening')} />
                </Field>
                <Field label="Closes">
                  <input type="time" className={inputClass} value={draft.closing} onChange={set('closing')} />
                </Field>
              </div>
            </Card>
          </section>
      </div>

      <Dialog
        open={!!pinTarget}
        onClose={() => setPinTarget(null)}
        title={`Set PIN · ${pinTarget?.name || ''}`}
        subtitle="4–6 digits. Weak sequences (1234, 0000…) are rejected."
        footer={
          <>
            <Button variant="outline" onClick={() => setPinTarget(null)}>Cancel</Button>
            <Button
              variant="dark"
              disabled={!pinVal.trim() || !pinConfirm.trim() || !bossPassword}
              onClick={submitPIN}>
              Update PIN
            </Button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="New PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${inputClass} text-center font-mono tracking-[0.4em]`}
                value={pinVal}
                onChange={(e) => setPinVal(e.target.value)} />
            </Field>
            <Field label="Confirm PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${inputClass} text-center font-mono tracking-[0.4em]`}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value)} />
            </Field>
          </div>
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
      </Dialog>

      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Live preview"
        subtitle="Store identity up close"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              {dirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <Button variant="dark" onClick={() => setPreviewOpen(false)}>
              Done
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-sm font-bold text-white">
              {(draft.name || 'M').charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-sm font-extrabold uppercase tracking-[0.14em] text-ink">
              {draft.name}
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-ink">{draft.businessName}</p>
                <p className="text-xs text-meta">{draft.city} · 20 min delivery</p>
              </div>
              <Pill tone="green" dot>Open</Pill>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-meta">
                <MapPinIcon className="h-3.5 w-3.5" />
                Address
              </span>
              <span className="truncate font-semibold text-ink">{draft.address}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-meta">
                <StoreIcon className="h-3.5 w-3.5" />
                Phone
              </span>
              <span className="font-mono font-semibold text-ink">{draft.phone}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-meta">
                <ClockIcon className="h-3.5 w-3.5" />
                Hours
              </span>
              <span className="font-mono font-semibold text-ink">{draft.opening}–{draft.closing}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-xs">
            <span className="text-meta">Tax</span>
            <span className="font-mono font-bold text-ink">{draft.taxName} {draft.taxRate}%</span>
          </div>
        </div>
      </Dialog>
    </div>);

}