import { useState } from 'react';
import {
  BellRingIcon,
  ChefHatIcon,
  TriangleAlertIcon,
  Volume2Icon,
  WalletIcon
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Controls';
import { Button } from '../../components/ui/Button';
import { useSound, DEFAULT_SOUND_PREFS } from '../../state/SoundContext';
import { SaveBar } from './settingsKit';

const CHANNELS = [
  {
    key: 'orders',
    label: 'Order sounds',
    desc: 'New orders, orders arriving from the online store or another terminal, and status changes.',
    icon: <BellRingIcon className="h-4 w-4" />,
    preview: ['orderCreated', 'orderReceived']
  },
  {
    key: 'kitchen',
    label: 'Kitchen / KDS alerts',
    desc: 'New tickets on the kitchen display and ready-to-serve chimes.',
    icon: <ChefHatIcon className="h-4 w-4" />,
    preview: ['kdsNew', 'kdsReady']
  },
  {
    key: 'payments',
    label: 'Payment sounds',
    desc: 'Charge completed and payment declined.',
    icon: <WalletIcon className="h-4 w-4" />,
    preview: ['paymentSuccess', 'paymentFailed']
  },
  {
    key: 'notifications',
    label: 'Notification sounds',
    desc: 'General app notifications and successful actions.',
    icon: <Volume2Icon className="h-4 w-4" />,
    preview: ['notification', 'success']
  },
  {
    key: 'warnings',
    label: 'Warnings & critical alerts',
    desc: 'Low stock, printer errors, system failures — the sounds that should interrupt.',
    icon: <TriangleAlertIcon className="h-4 w-4" />,
    preview: ['warning', 'critical']
  }
];

export function SoundSection() {
  const { prefs, update, play } = useSound();
  const [draft, setDraft] = useState(prefs);
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);

  const save = () => {
    setBusy(true);
    update(draft);
    setTimeout(() => {
      setBusy(false);
      setJustSaved(true);
      // A saved sound setting should be heard to be believed.
      if (next.master) play('success', { force: true });
      setTimeout(() => setJustSaved(false), 2500);
    }, 200);
  };

  const next = dirty ? draft : prefs;

  const setChannel = (key, on) => setDraft((d) => ({ ...d, channels: { ...d.channels, [key]: on } }));

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-ink">Master sound</h2>
            <p className="mt-1 text-sm text-meta">
              One switch for every sound in the app. Notifications and visual alerts stay on —
              only the audio goes quiet.
            </p>
          </div>
          <Toggle
            checked={draft.master}
            onChange={(on) => setDraft((d) => ({ ...d, master: on }))}
            label="Master sound" />
        </div>

        <div className={`mt-5 flex items-center gap-4 rounded-xl border px-4 py-3 transition-opacity duration-150 ${draft.master ? 'border-line' : 'border-line opacity-50'}`}>
          <Volume2Icon className="h-4 w-4 shrink-0 text-meta" aria-hidden="true" />
          <label className="flex flex-1 items-center gap-3 text-sm font-semibold text-ink">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(draft.volume * 100)}
              disabled={!draft.master}
              onChange={(e) => setDraft((d) => ({ ...d, volume: Number(e.target.value) / 100 }))}
              onBlur={() => play('notice', { force: draft.master })}
              className="h-1.5 flex-1 accent-[#1C1B19]"
              aria-label="Sound volume" />
            <span className="w-10 text-right font-mono text-13 text-meta">{Math.round(draft.volume * 100)}%</span>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!draft.master}
            onClick={() => play('notification', { force: draft.master })}>
            Test
          </Button>
        </div>
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <h2 className="text-sm font-bold tracking-tight text-ink">Channels</h2>
          <p className="mt-1 text-sm text-meta">Choose which events are allowed to make a sound. Each channel has its own character — orders chime, payments resolve, warnings interrupt.</p>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {CHANNELS.map((ch) => (
            <li key={ch.key} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 text-meta">{ch.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{ch.label}</p>
                  <p className="mt-0.5 text-13 text-meta">{ch.desc}</p>
                  {draft.master && (
                    <div className="mt-2 flex gap-1.5">
                      {ch.preview.map((ev) => (
                        <Button
                          key={ev}
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => play(ev, { force: true })}>
                          ▶ {ev === ch.preview[0] ? 'Preview' : 'Alt'}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Toggle
                checked={next.channels[ch.key] !== false}
                onChange={(on) => setChannel(ch.key, on)}
                label={ch.label} />
            </li>
          ))}
        </ul>
      </Card>

      <SaveBar
        dirty={dirty}
        busy={busy}
        justSaved={justSaved}
        errors={null}
        onSave={save}
        onReset={() => setDraft(prefs)} />

      <p className="text-13 text-meta">
        Sounds are intentionally subtle and never the only signal — every sound is paired with a
        toast, badge, or on-screen status change. Preferences are remembered on this device.
        Defaults: {DEFAULT_SOUND_PREFS.master ? 'on' : 'off'} at {Math.round(DEFAULT_SOUND_PREFS.volume * 100)}% volume.
      </p>
    </div>
  );
}
