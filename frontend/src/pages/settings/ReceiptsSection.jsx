import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass, Toggle } from '../../components/ui/Controls';
import { FieldError, SaveBar, useDraft } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';

// What prints at the bottom of every customer receipt, and whether the
// register prints automatically on charge. These flow through
// utils/printReceipt.js — every pay path already passes `settings` into the
// builder, so a change here is live on the very next receipt.
export function ReceiptsSection() {
  const { settings, update } = useSettings();
  const { draft, set, dirty, reset } = useDraft({
    receiptFooter: settings.receiptFooter || '',
    receiptThanks: settings.receiptThanks || '',
    autoPrintReceipts: settings.autoPrintReceipts !== false,
    printKotOnCharge: settings.printKotOnCharge !== false
  });
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const errors = {};
  if (draft.receiptFooter.length > 120) errors.receiptFooter = 'Keep the footer under 120 characters — it has to fit a 80mm slip.';

  const save = () => {
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    update(draft);
    setTimeout(() => {
      setBusy(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }, 250);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Receipt content</h2>
        <p className="mt-1 text-sm text-meta">
          Business name, address, phone and VAT come from the Restaurant section; this is the closing message.
        </p>
        <div className="mt-4 space-y-4">
          <Field label={`Footer line (${draft.receiptFooter.length}/120)`}>
            <input
              className={inputClass}
              value={draft.receiptFooter}
              aria-invalid={!!errors.receiptFooter}
              onChange={(e) => set({ receiptFooter: e.target.value })}
              placeholder="Thank you for dining with us!" />
            <FieldError>{errors.receiptFooter}</FieldError>
          </Field>
          <Field label="Thank-you note (shown under the footer)">
            <input
              className={inputClass}
              value={draft.receiptThanks}
              onChange={(e) => set({ receiptThanks: e.target.value })}
              placeholder="See you again soon!" />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Printing behaviour</h2>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Auto-print receipt on charge</span>
              <span className="block text-xs text-meta">The register opens the print dialog the moment an order is paid.</span>
            </span>
            <Toggle
              checked={draft.autoPrintReceipts}
              onChange={(v) => set({ autoPrintReceipts: v })}
              label="Auto-print receipt on charge" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Print KOT when the order is sent</span>
              <span className="block text-xs text-meta">Kitchen ticket prints for the item's station alongside the receipt.</span>
            </span>
            <Toggle
              checked={draft.printKotOnCharge}
              onChange={(v) => set({ printKotOnCharge: v })}
              label="Print KOT when the order is sent" />
          </div>
        </div>
      </Card>

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} errors={errors} onSave={save} onReset={reset} />
    </div>
  );
}
