import { useState } from 'react';
import { MailIcon, MessageSquareIcon, SmartphoneIcon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AIBadge, Pill } from '../components/ui/Pill';
import { Field, GhostCard, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { useCampaigns, campaignPhase, timeline } from '../state/CampaignContext';
import { menuItems } from '../data/manage';

const channelIcon = {
  Email: MailIcon,
  SMS: MessageSquareIcon,
  Push: SmartphoneIcon
};

const statusTone = {
  Scheduled: 'blue',
  Sent: 'green',
  Draft: 'neutral'
};

const phaseTone = { preview: 'blue', preorder: 'amber', order: 'green', hidden: 'neutral' };
const phaseLabel = { preview: 'Preview', preorder: 'Pre-order', order: 'Order', hidden: 'Preview pending' };
const phaseIndex = { hidden: -1, preview: 0, preorder: 1, order: 2 };

export function Marketing() {
  const { campaignList, upsertCampaign } = useCampaigns();
  const toast = useToast();
  const [building, setBuilding] = useState(false);
  const [step, setStep] = useState('build');
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('Dashain set menu preview');
  const [audience, setAudience] = useState('All members (1,204)');
  const [channel, setChannel] = useState('Email');
  const [message, setMessage] = useState(
    'Dashain at Thamel House — our set menu opens Friday. Members book a day early, with a complimentary sel roti platter for tables of four.'
  );
  const [dish, setDish] = useState('None');
  const [previewStart, setPreviewStart] = useState('2026-09-08');
  const [preorderStart, setPreorderStart] = useState('2026-09-11');
  const [orderStart, setOrderStart] = useState('2026-09-20');
  const [schedule, setSchedule] = useState('2026-09-11T09:00');

  const scheduledFor = (short = false) => {
    if (!schedule) return 'Not scheduled';
    const d = new Date(schedule);
    if (Number.isNaN(d.getTime())) return 'Not scheduled';
    return d.toLocaleDateString('en-US', short
      ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const loadCampaign = (c) => {
    setEditingId(c.id);
    setName(c.name);
    setAudience(c.audience.includes('(') ? c.audience : 'All members (1,204)');
    setChannel(c.channel);
    setDish(c.dish || 'None');
    setPreviewStart(c.previewStart || '');
    setPreorderStart(c.preorderStart || '');
    setOrderStart(c.orderStart || '');
    setMessage(c.message || '');
    setBuilding(true);
    setStep('build');
  };

  const upsertDraft = () => {
    upsertCampaign({
      id: editingId || `c${Date.now()}`,
      name,
      channel,
      audience: '1,204 members',
      status: 'Draft',
      stat: 'Not scheduled',
      previewStart: previewStart || undefined,
      preorderStart: preorderStart || undefined,
      orderStart: orderStart || undefined,
      dish: dish === 'None' ? undefined : dish,
      message
    });
    toast('Campaign saved as draft', { tone: 'green' });
    setBuilding(false);
    setEditingId(null);
  };

  const handlePublish = () => {
    upsertCampaign({
      id: editingId || `c${Date.now()}`,
      name,
      channel,
      audience: '1,204 members',
      status: 'Scheduled',
      stat: `Sends ${scheduledFor(true)}`,
      previewStart: previewStart || undefined,
      preorderStart: preorderStart || undefined,
      orderStart: orderStart || undefined,
      dish: dish === 'None' ? undefined : dish,
      message
    });
    toast(editingId ? 'Campaign updated' : 'Campaign scheduled', { tone: 'green' });
    setBuilding(false);
    setEditingId(null);
  };

  const handleSendTest = () => {
    toast('Test sent', { tone: 'green' });
  };

  const channelAudience = audience.match(/\(([\d,]+)\)/)?.[1] || '1,204';

  const draftCampaign = {
    previewStart: previewStart || undefined,
    preorderStart: preorderStart || undefined,
    orderStart: orderStart || undefined
  };
  const draftPhase = campaignPhase(draftCampaign);
  const draftIndex = phaseIndex[draftPhase];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Marketing" descriptor="4 campaigns · 2 live this week">
        <Button variant="dark" onClick={() => { setBuilding((b) => !b); setStep('build'); setEditingId(null); }}>
          {building ? 'Back to campaigns' : 'New campaign'}
        </Button>
      </PageHeader>

      {building ?
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {step === 'build' ? (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-ink">
                  {editingId ? 'Edit campaign' : 'Campaign builder'}
                </h2>
                {editingId && <Pill tone="neutral">{editingId}</Pill>}
              </div>
              <div className="mt-5 space-y-5">
                <Field label="Campaign name">
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dashain set menu preview" />
                </Field>
                <Field label="Audience segment">
                  <select
                    className={inputClass}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}>
                    <option>All members (1,204)</option>
                    <option>VIP tier (76)</option>
                    <option>Quiet 60+ days (318)</option>
                    <option>Birthday this month (64)</option>
                  </select>
                </Field>
                <Field label="Channel">
                  <select
                    className={inputClass}
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}>
                    <option>Email</option>
                    <option>SMS</option>
                    <option>Push</option>
                  </select>
                </Field>

                <div className="rounded-xl border border-line bg-canvas p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Promote a dish
                  </p>
                  <p className="mt-1 text-xs text-meta">
                    Pick a dish and the register banner lets guests pre-order it against
                    the dates below.
                  </p>
                  <select
                    className={inputClass}
                    value={dish}
                    onChange={(e) => setDish(e.target.value)}>
                    <option>None</option>
                    {menuItems.map((i) => <option key={i.name}>{i.name}</option>)}
                  </select>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    Phase dates
                  </p>
                  <p className="mt-1 text-xs text-meta">
                    Each phase unlocks automatically when its date arrives — Preview → Pre-order → Order.
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <Field label="Preview starts">
                      <input
                        type="date"
                        className={inputClass}
                        value={previewStart}
                        onChange={(e) => setPreviewStart(e.target.value)} />
                    </Field>
                    <Field label="Pre-order starts">
                      <input
                        type="date"
                        className={inputClass}
                        value={preorderStart}
                        onChange={(e) => setPreorderStart(e.target.value)} />
                    </Field>
                    <Field label="Order starts">
                      <input
                        type="date"
                        className={inputClass}
                        value={orderStart}
                        onChange={(e) => setOrderStart(e.target.value)} />
                    </Field>
                  </div>
                </div>

                <Field label="Message">
                  <textarea
                    rows={5}
                    className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)} />
                </Field>
                <Field label="Send time">
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)} />
                </Field>
              </div>
              <div className="mt-6 flex gap-2 border-t border-line pt-5">
                <Button variant="outline" onClick={upsertDraft}>
                  Save draft
                </Button>
                <Button variant="dark" onClick={() => setStep('review')}>
                  Review & publish
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <h2 className="text-lg font-extrabold text-ink">Review campaign</h2>
              <p className="mt-1 text-sm text-meta">Confirm details before publishing</p>

              <div className="mt-5 space-y-4">
                {dish !== 'None' && (
                  <div className="rounded-xl border border-ink/20 bg-ink px-4 py-3 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                      Featured dish
                    </p>
                    <p className="mt-1 text-lg font-extrabold">{dish}</p>
                    {preorderStart && (
                      <p className="text-xs text-white/60">
                        Pre-orders open {new Date(`${preorderStart}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Phase timeline</p>
                  <p className="mt-1 text-xs text-meta">
                    The register banner advances on its own as each date passes.
                  </p>
                  <ol className="mt-3 space-y-2">
                    {timeline(draftCampaign).map((step, i) => {
                      const done = draftIndex > i;
                      const active = draftIndex === i;
                      return (
                        <li key={step.label} className="flex items-center gap-3 text-sm">
                          <span className={`h-3 w-3 shrink-0 rounded-full border ${
                            done ? 'border-status-green bg-status-green' :
                            active ? 'border-ink bg-ink' : 'border-line bg-line'}`} />
                          <span className={active ? 'font-semibold text-ink' : 'text-meta'}>
                            {step.label}
                          </span>
                          <span className="ml-auto font-mono text-xs text-meta">{step.display}</span>
                          {active && <Pill tone={phaseTone[draftPhase]} dot>Now</Pill>}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Audience</p>
                  <p className="mt-1 font-mono text-lg font-extrabold text-ink">{channelAudience}</p>
                  <p className="text-sm text-meta">{audience}</p>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Channel preview</p>
                  <div className="space-y-3">
                    {channel === 'Email' && (
                      <div className="rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2">
                          <MailIcon className="h-4 w-4 text-meta" />
                          <span className="text-xs font-semibold text-meta">Email</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-ink">{name}</p>
                        <p className="mt-1 text-xs leading-relaxed text-meta">{message}</p>
                      </div>
                    )}
                    {channel === 'SMS' && (
                      <div className="rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2">
                          <MessageSquareIcon className="h-4 w-4 text-meta" />
                          <span className="text-xs font-semibold text-meta">SMS</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-meta">{message}</p>
                        <p className="mt-1 text-[10px] text-meta">STOP to opt out</p>
                      </div>
                    )}
                    {channel === 'Push' && (
                      <div className="rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2">
                          <SmartphoneIcon className="h-4 w-4 text-meta" />
                          <span className="text-xs font-semibold text-meta">Push notification</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-ink">{name}</p>
                        <p className="mt-1 text-xs leading-relaxed text-meta">{message.slice(0, 80)}…</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Scheduled send</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {scheduledFor()}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-2 border-t border-line pt-5">
                <Button variant="outline" onClick={() => setStep('build')}>
                  Back
                </Button>
                <Button variant="outline" onClick={handleSendTest}>
                  Send test
                </Button>
                <Button variant="dark" onClick={handlePublish}>
                  {editingId ? 'Save changes' : 'Publish'}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Estimated reach
            </h3>
            <p className="mt-2 font-mono text-3xl font-extrabold text-ink">{channelAudience}</p>
            <p className="text-sm text-meta">members · 92% deliverable</p>
            <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-meta">Predicted open</span>
                <span className="font-mono font-semibold">38–44%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-meta">Predicted redemption</span>
                <span className="font-mono font-semibold">9–13%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-meta">Cost</span>
                <span className="font-mono font-semibold">Rs 0</span>
              </div>
            </div>
          </Card>
        </div> :

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaignList.map((c, idx) => {
          const Icon = channelIcon[c.channel];
          const phase = campaignPhase(c);
          return (
            <article
              key={`${c.name}-${idx}`}
              className="flex flex-col rounded-card border border-line bg-surface p-5">

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas text-ink">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-[16px] font-bold leading-tight text-ink">
                      {c.name}
                    </h3>
                  </div>
                  <Pill tone={statusTone[c.status]} dot>
                    {c.status}
                  </Pill>
                </div>
                <p className="mt-3 text-sm text-meta">{c.stat}</p>
                <p className="mt-1 text-sm text-meta">{c.audience}</p>
                {c.dish &&
              <p className="mt-1 text-sm font-semibold text-ink">
                    Featured dish — {c.dish}
                  </p>
              }
                {c.previewStart &&
              <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={phaseTone[phase]} dot>
                        {phaseLabel[phase]}
                      </Pill>
                      {phase !== 'hidden' && c.preorderStart && (
                        <span className="text-[11px] text-meta">
                          {phase === 'preview'
                            ? `Pre-order opens ${timeline(c)[1]?.display}`
                            : phase === 'preorder'
                              ? `Order opens ${timeline(c)[2]?.display}`
                              : 'Promo ended · ordering live'}
                        </span>
                      )}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-meta">
                      {timeline(c).map((t, i) => (
                        <span key={t.label} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-meta">→</span>}
                          <span className={i === phaseIndex[phase] ? 'font-bold text-ink' : ''}>
                            {t.label} {t.display}
                          </span>
                        </span>
                      ))}
                    </p>
                  </div>
              }
                {c.ai &&
              <div className="mt-3">
                    <AIBadge label="AI generated" />
                  </div>
              }
                <div className="mt-auto flex gap-2 pt-5">
                  <Button size="sm" variant="outline" onClick={() => toast(`Campaign "${c.name}" duplicated`, { tone: 'green' })}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => c.status === 'Sent' ? toast('Report coming soon', { tone: 'neutral' }) : loadCampaign(c)}>
                    {c.status === 'Sent' ? 'View report' : 'Edit'}
                  </Button>
                </div>
              </article>);

        })}
          <GhostCard
          label="New campaign"
          className="min-h-[214px]"
          onClick={() => setBuilding(true)} />

        </div>
      }
    </div>);

}