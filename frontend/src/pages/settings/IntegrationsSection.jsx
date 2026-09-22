import { useEffect, useState } from 'react';
import { GlobeIcon, MailIcon, PlugIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, inputClass } from '../../components/ui/Controls';
import { Pill } from '../../components/ui/Pill';
import { SaveBar, useDraft } from './settingsKit';
import { useSettings } from '../../state/SettingsContext';
import api from '../../api/client';

/**
 * Integrations: the external touchpoints this deployment uses. Everything
 * here is honest — green only when the backend actually answers, amber for
 * "configured but not proven", red for down. Email (Resend) is probed via the
 * register flow's marker; Google OAuth via the redirect endpoint.
 */
function IntegrationRow({ icon, name, desc, status }) {
  const pill = {
    live: { tone: 'green', label: 'Live' },
    unconfigured: { tone: 'amber', label: 'Not configured' },
    down: { tone: 'red', label: 'Down' },
    checking: { tone: 'neutral', label: 'Checking…' }
  }[status] || { tone: 'neutral', label: 'Unknown' };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-status-blue">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{name}</span>
          <span className="block truncate text-xs text-meta">{desc}</span>
        </span>
      </span>
      <Pill tone={pill.tone} dot>{pill.label}</Pill>
    </div>
  );
}

export function IntegrationsSection() {
  const { settings, update } = useSettings();
  const { draft, set, dirty, reset } = useDraft({
    onlineStoreUrl: settings.onlineStoreUrl || ''
  });
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Probe the two server-side integrations without exposing secrets —
  // GET /auth/providers reports google + email_ready flags only.
  const [emailStatus, setEmailStatus] = useState('checking');
  const [oauthStatus, setOauthStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;
    api('/auth/providers')
      .then((res) => {
        if (cancelled) return;
        setEmailStatus(res?.email_ready ? 'live' : 'unconfigured');
        setOauthStatus(res?.google ? 'live' : 'unconfigured');
      })
      .catch(() => {
        if (cancelled) return;
        setEmailStatus('down');
        setOauthStatus('down');
      });
    return () => { cancelled = true; };
  }, []);

  const errors = {};
  const url = draft.onlineStoreUrl.trim();
  if (url && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url)) {
    errors.onlineStoreUrl = 'Enter a domain like thamelhouse.order.np (no https://, no path).';
  }

  const save = () => {
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    update({ onlineStoreUrl: url });
    setTimeout(() => {
      setBusy(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }, 250);
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Connected services</h2>
        <p className="mt-1 text-sm text-meta">Status is checked live against the backend — no secrets are shown here.</p>
        <div className="mt-4 space-y-2">
          <IntegrationRow
            icon={<MailIcon className="h-4 w-4" />}
            name="Email — Resend"
            desc="Verification codes, password resets and receipt emails"
            status={emailStatus} />
          <IntegrationRow
            icon={<GlobeIcon className="h-4 w-4" />}
            name="Google OAuth"
            desc="Owner sign-in with Google on the landing page"
            status={oauthStatus} />
          <IntegrationRow
            icon={<PlugIcon className="h-4 w-4" />}
            name="Payment gateways"
            desc="eSewa, Khalti and IME Pay — configured in the Payments section"
            status="unconfigured" />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Online store</h2>
        <p className="mt-1 text-sm text-meta">The public address customers open to order from their table.</p>
        <div className="mt-4 max-w-md">
          <Field label="Storefront domain">
            <input
              className={inputClass}
              value={draft.onlineStoreUrl}
              aria-invalid={!!errors.onlineStoreUrl}
              onChange={(e) => set({ onlineStoreUrl: e.target.value })}
              placeholder="thamelhouse.order.np" />
            {errors.onlineStoreUrl
              ? null
              : url &&
              <a
                href={`https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-semibold text-status-blue underline underline-offset-2">
                Open https://{url} ↗
              </a>
            }
            {errors.onlineStoreUrl && <p className="mt-1 text-xs font-semibold text-status-red">{errors.onlineStoreUrl}</p>}
          </Field>
        </div>
      </Card>

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} errors={errors} onSave={save} onReset={reset} />
    </div>
  );
}
