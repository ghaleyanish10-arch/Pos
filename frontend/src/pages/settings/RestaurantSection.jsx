import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Controls';
import { FieldError, SaveBar, useDraft } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';

// Business identity + contact details. These values flow onto receipts,
// invoices, the storefront header and email footers, so the validation is
// deliberately strict about the fields machines consume (email, VAT/PAN).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VAT_RE = /^\d{6,12}$/;

export function RestaurantSection() {
  const { settings, update } = useSettings();
  const { draft, set, dirty, reset } = useDraft({
    name: settings.name,
    businessName: settings.businessName,
    email: settings.email,
    address: settings.address,
    city: settings.city,
    phone: settings.phone,
    vatNo: settings.vatNo
  });
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const errors = {};
  if (!draft.name.trim()) errors.name = 'Business name is required — it appears on receipts.';
  if (!draft.businessName.trim()) errors.businessName = 'The storefront needs a public name.';
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) {
    errors.email = 'Enter a valid email, e.g. hello@thamelhouse.com.';
  }
  if (draft.vatNo.trim() && !VAT_RE.test(draft.vatNo.trim())) {
    errors.vatNo = 'VAT / PAN is 6–12 digits (Nepal IRD format).';
  }

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
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Identity</h2>
        <p className="mt-1 text-sm text-meta">Shown across the dashboard, receipts, invoices and the online store.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Business name *">
            <input
              className={inputClass}
              value={draft.name}
              aria-invalid={!!errors.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Mesa" />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field label="Online storefront name *">
            <input
              className={inputClass}
              value={draft.businessName}
              aria-invalid={!!errors.businessName}
              onChange={(e) => set({ businessName: e.target.value })}
              placeholder="Thamel House" />
            <FieldError>{errors.businessName}</FieldError>
          </Field>
          <Field label="Currency symbol">
            <input className={inputClass} value={draft.currency} onChange={(e) => set({ currency: e.target.value })} placeholder="Rs" />
          </Field>
          <Field label="Email (order notifications)">
            <input
              className={inputClass}
              type="email"
              value={draft.email}
              aria-invalid={!!errors.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="hello@thamelhouse.com" />
            <FieldError>{errors.email}</FieldError>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Contact &amp; location</h2>
        <p className="mt-1 text-sm text-meta">Printed on receipts and invoices, shown to guests.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address">
            <input className={inputClass} value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={draft.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="VAT / PAN number">
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.vatNo}
              aria-invalid={!!errors.vatNo}
              onChange={(e) => set({ vatNo: e.target.value })}
              placeholder="601234567" />
            <FieldError>{errors.vatNo}</FieldError>
          </Field>
        </div>
      </Card>

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} errors={errors} onSave={save} onReset={reset} />
    </div>
  );
}
