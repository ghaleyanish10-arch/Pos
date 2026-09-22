import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass, Toggle } from '../../components/ui/Controls';
import { FieldError, SaveBar, useDraft } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';

// Day-to-day operations: opening hours (storefront open/closed badge) and the
// service charge the register applies on hospitality orders.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function OperationsSection() {
  const { settings, update } = useSettings();
  const { draft, set, dirty, reset } = useDraft({
    opening: settings.opening,
    closing: settings.closing,
    serviceCharge: settings.serviceCharge
  });
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const errors = {};
  if (!TIME_RE.test(draft.opening)) errors.opening = 'Use a 24h time, e.g. 08:00.';
  if (!TIME_RE.test(draft.closing)) errors.closing = 'Use a 24h time, e.g. 22:00.';
  if (TIME_RE.test(draft.opening) && TIME_RE.test(draft.closing) && draft.opening >= draft.closing) {
    errors.closing = 'Closing must be after opening (overnight hours: contact support to enable).';
  }
  const sc = Number(draft.serviceCharge);
  if (!Number.isFinite(sc) || sc < 0 || sc > 25) {
    errors.serviceCharge = 'Service charge is 0–25%. Nepal caps the service-charge split at 25%.';
  }

  const save = () => {
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    update({ ...draft, serviceCharge: sc });
    setTimeout(() => {
      setBusy(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }, 250);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Opening hours</h2>
        <p className="mt-1 text-sm text-meta">Drives the open / closed badge on the online storefront.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Opens">
            <input
              type="time"
              className={inputClass}
              value={draft.opening}
              aria-invalid={!!errors.opening}
              onChange={(e) => set({ opening: e.target.value })} />
            <FieldError>{errors.opening}</FieldError>
          </Field>
          <Field label="Closes">
            <input
              type="time"
              className={inputClass}
              value={draft.closing}
              aria-invalid={!!errors.closing}
              onChange={(e) => set({ closing: e.target.value })} />
            <FieldError>{errors.closing}</FieldError>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Service charge</h2>
        <p className="mt-1 text-sm text-meta">Added to dine-in bills; split 50/50 between staff and the house per Nepali custom.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Service charge %">
            <input
              type="number"
              min="0"
              max="25"
              step="0.5"
              className={inputClass}
              value={draft.serviceCharge}
              aria-invalid={!!errors.serviceCharge}
              onChange={(e) => set({ serviceCharge: e.target.value })} />
            <FieldError>{errors.serviceCharge}</FieldError>
          </Field>
          <div className="flex items-end pb-2">
            <Toggle
              checked={false}
              onChange={() => {}}
              label="Charged on dine-in orders only" />
          </div>
        </div>
      </Card>

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} errors={errors} onSave={save} onReset={reset} />
    </div>
  );
}
