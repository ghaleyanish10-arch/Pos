import { useEffect, useState } from 'react';
import { WalletIcon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Controls';
import { Pill } from '../../components/ui/Pill';
import { Spinner } from '../../components/ui/Spinner';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { useToast } from '../../components/ui/Toast';
import api from '../../api/client';

// Nepal gateway brand colors — staff recognize these on sight (Restronp-style).
const GATEWAY_META = {
  esewa: { label: 'eSewa', color: '#60BB46' },
  khalti: { label: 'Khalti', color: '#5C2D91' },
  imepay: { label: 'IME Pay', color: '#F6871F' }
};

function Toggle2({ on, onChange, label }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-150 ease-soft ${
        on ? 'border-status-green/30 bg-tint-green text-status-green' : 'border-line bg-canvas text-meta hover:text-ink'
      }`}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-status-green' : 'bg-meta'}`} aria-hidden="true" />
      {label}
    </button>
  );
}

function GatewayCard({ meta, status, onSaved, toast }) {
  const [merchant, setMerchant] = useState(status.merchant_id || '');
  const [apiKey, setApiKey] = useState('');
  const [sandbox, setSandbox] = useState(!!status.sandbox);
  const [enabled, setEnabled] = useState(!!status.enabled);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/gateways/${meta.key}`, {
        method: 'PUT',
        body: { merchant_id: merchant, api_key: apiKey, sandbox, enabled }
      });
      onSaved(meta.key, { provider: meta.key, merchant_id: merchant, has_api_key: apiKey ? true : status.has_api_key, sandbox, enabled });
      setApiKey('');
      toast(`${meta.label} saved — key stored server-side`, { tone: 'green' });
    } catch (e) {
      toast(e.message || `Failed to save ${meta.label}`, { tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: meta.color }}>
            <WalletIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-extrabold text-ink">{meta.label}</span>
          <Pill tone={enabled ? 'green' : 'neutral'} dot>{enabled ? 'Enabled' : 'Off'}</Pill>
          {status.has_api_key && <Pill tone="neutral">Key saved</Pill>}
        </span>
        <div className="flex items-center gap-2">
          <Toggle2 on={sandbox} onChange={setSandbox} label={sandbox ? 'Sandbox' : 'Live'} />
          <Toggle2 on={enabled} onChange={setEnabled} label={enabled ? 'On' : 'Off'} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Merchant ID">
          <input className={inputClass} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. EPAYTEST" />
        </Field>
        <Field label="API key">
          <input
            type="password"
            className={inputClass}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status.has_api_key ? '•••••• saved — leave blank to keep' : 'Paste the gateway API key'} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="dark" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save gateway'}
        </Button>
      </div>
    </div>
  );
}

export function PaymentsSection() {
  const toast = useToast();
  const [gateways, setGateways] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/gateways')
      .then((res) => { if (!cancelled) setGateways(res?.data || []); })
      .catch(() => { if (!cancelled) setGateways([]); });
    return () => { cancelled = true; };
  }, []);

  const patchGateway = (key, next) =>
    setGateways((prev) => {
      const list = prev || [];
      return list.some((g) => g.provider === key)
        ? list.map((g) => (g.provider === key ? next : g))
        : [...list, next];
    });

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-extrabold tracking-tight text-ink">Payment gateways</h2>
        <p className="mt-1 text-sm text-meta">
          Merchant credentials are stored server-side only — keys never reach the browser or a receipt.
        </p>
        <div className="mt-4 space-y-3">
          {gateways === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-meta"><Spinner className="h-4 w-4" /> Loading gateways…</div>
          ) : (
            Object.entries(GATEWAY_META).map(([key, meta]) => {
              const status = gateways.find((g) => g.provider === key) || { merchant_id: '', has_api_key: false, sandbox: true, enabled: false };
              return <GatewayCard key={key} meta={{ key, ...meta }} status={status} onSaved={patchGateway} toast={toast} />;
            })
          )}
          <AlertBanner tone="amber">
            Charges are simulated end-to-end until the real SDKs are wired — the register marks gateway payments clearly.
          </AlertBanner>
        </div>
      </Card>
    </div>
  );
}
