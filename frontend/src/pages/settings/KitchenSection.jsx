import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass, Toggle } from '../../components/ui/Controls';
import { FieldError, SaveBar, useDraft } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';

// Kitchen display behaviour: the SLA that turns a ticket red, the chime when
// a new ticket lands, and auto-fire. KDS.jsx reads these live from context —
// no reload needed.
export function KitchenSection() {
  const { settings, update } = useSettings();
  const { draft, set, dirty, reset } = useDraft({
    kitchenSla: settings.kitchenSla ?? 15,
    kitchenSound: settings.kitchenSound !== false,
    kitchenAutoFire: !!settings.kitchenAutoFire
  });
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const sla = Number(draft.kitchenSla);
  const errors = {};
  if (!Number.isFinite(sla) || sla < 5 || sla > 60) {
    errors.kitchenSla = 'SLA must be between 5 and 60 minutes.';
  }

  const save = () => {
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    update({ ...draft, kitchenSla: sla });
    setTimeout(() => {
      setBusy(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }, 250);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Ticket SLA</h2>
        <p className="mt-1 text-sm text-meta">
          How long a ticket may sit before it turns red and counts as LATE on the kitchen display.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Late after (minutes)">
            <input
              type="number"
              min="5"
              max="60"
              className={inputClass}
              value={draft.kitchenSla}
              aria-invalid={!!errors.kitchenSla}
              onChange={(e) => set({ kitchenSla: e.target.value })} />
            <FieldError>{errors.kitchenSla}</FieldError>
          </Field>
          <div className="flex items-end pb-2 text-sm text-meta">
            Tickets older than {Number.isFinite(sla) && sla >= 5 ? sla : '—'} minutes show the red OVER band.
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Alerts</h2>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Chime on new ticket</span>
              <span className="block text-xs text-meta">A short tone plays when an order lands in the NEW lane.</span>
            </span>
            <Toggle
              checked={draft.kitchenSound}
              onChange={(v) => set({ kitchenSound: v })}
              label="Chime on new ticket" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Auto-fire tickets</span>
              <span className="block text-xs text-meta">
                New tickets start in COOKING immediately. Leave off when the expo controls firing.
              </span>
            </span>
            <Toggle
              checked={draft.kitchenAutoFire}
              onChange={(v) => set({ kitchenAutoFire: v })}
              label="Auto-fire tickets" />
          </div>
        </div>
      </Card>

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} errors={errors} onSave={save} onReset={reset} />
    </div>
  );
}
