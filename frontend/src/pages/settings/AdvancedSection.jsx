import { useState } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { ConfirmTyped } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';
import { useToast } from '../../components/ui/Toast';

// The dangerous stuff lives here, deliberately behind friction: resetting
// wipes every local operational setting (receipts, kitchen, storefront URL)
// back to defaults and reverts the storefront config on the server.
export function AdvancedSection() {
  const { reset } = useSettings();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doReset = () => {
    setBusy(true);
    reset();
    setTimeout(() => {
      setBusy(false);
      setConfirmOpen(false);
      toast('Settings reset to defaults', { tone: 'dark' });
    }, 300);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">About</h2>
        <div className="mt-3 grid gap-2 text-sm text-meta sm:grid-cols-2">
          <p><span className="font-semibold text-ink">App:</span> Mesa OS</p>
          <p><span className="font-semibold text-ink">Stack:</span> React · Go · Postgres</p>
          <p><span className="font-semibold text-ink">Receipt builder:</span> browser print (80mm)</p>
          <p><span className="font-semibold text-ink">Audit:</span> every settings change is logged server-side</p>
        </div>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-status-red">
          <TriangleAlertIcon className="h-4 w-4" />
          Danger zone
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-red/25 bg-tint-red px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-ink">Reset all settings</span>
            <span className="block text-xs text-meta">
              Receipts, kitchen SLA, alerts and the storefront URL return to defaults. Staff, menu and sales data are untouched.
            </span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="h-9 shrink-0 rounded-xl border border-status-red bg-status-red px-4 text-sm font-bold text-white transition-colors duration-150 ease-soft hover:bg-status-red/90">
            Reset settings
          </button>
        </div>
      </Card>

      <ConfirmTyped
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset all settings?"
        body="Every operational setting returns to its default. This cannot be undone."
        confirmWord="reset"
        confirmLabel="Reset everything"
        busy={busy}
        onConfirm={doReset} />
    </div>
  );
}
