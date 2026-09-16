import { useState, useEffect } from 'react';
import { StarIcon } from 'lucide-react';
import { Card, PageHeader, SectionHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Pill } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { Field } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { useSettings } from '../state/SettingsContext';
import { surveyResponses } from '../data/orm';
import api from '../api/client';

function SurveyPreview() {
  const [rating, setRating] = useState(0);
  const { settings } = useSettings();

  return (
    <div className="pt-4">
      <p className="text-center text-base font-extrabold text-ink">{settings.businessName}</p>
      <p className="mt-1 text-center text-xs text-meta">Table 12 · 10 Sep</p>

      <div className="mt-6 rounded-card border border-line bg-surface p-5">
        <p className="text-center text-sm font-semibold text-ink">
          How was everything tonight?
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) =>
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}>

              <StarIcon
              className={`h-8 w-8 transition-colors duration-150 ease-soft ${
              n <= rating ? 'fill-status-amber text-status-amber' : 'text-line'}`
              } />

            </button>
          )}
        </div>

        {rating >= 4 &&
        <div className="mt-5">
            <p className="text-center text-sm text-meta">
              Wonderful — would you share it publicly?
            </p>
            <div className="mt-3 space-y-2">
              {['Review on Google', 'Review on TripAdvisor', 'Review on Facebook'].map((p) =>
            <button
              key={p}
              type="button"
              className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink">

                  {p}
                </button>
          )}
            </div>
          </div>
        }

        {rating > 0 && rating <= 3 &&
        <div className="mt-5">
            <p className="text-center text-sm text-meta">
              Sorry to hear that. Tell the manager directly — it stays private.
            </p>
            <textarea
            rows={4}
            placeholder="What went wrong?"
            className="mt-3 w-full rounded-xl border border-line bg-canvas p-3 text-sm placeholder:text-meta focus:border-ink focus:outline-none" />

            <button
            type="button"
            className="mt-3 w-full rounded-xl bg-status-green px-4 py-3 text-sm font-bold text-white">

              Send to manager
            </button>
          </div>
        }
      </div>
    </div>);

}

export function Feedback() {
  const toast = useToast();
  const [responses, setResponses] = useState(() =>
    surveyResponses.map((s) => ({ ...s }))
  );
  const [drawerItem, setDrawerItem] = useState(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/feedback');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) setResponses(data.map((g) => ({
          id: g.id,
          guest: g.guest_name || '',
          table: g.table_id || '',
          rating: g.rating || 0,
          comment: g.comment || '',
          when: new Date(g.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          resolved: !!g.resolved,
          escalated: !!g.escalated,
          staffNotes: [],
        })));
      } catch {
        /* keep static survey responses as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeItem = drawerItem ? responses.find((s) => s.id === drawerItem.id) : null;

  function handleResolve(id) {
    setResponses((prev) => prev.map((s) => s.id === id ? { ...s, resolved: true, escalated: false } : s));
    setDrawerItem(null);
    toast.success('Feedback marked resolved');
    api(`/feedback/${id}/resolve`, { method: 'PUT' }).catch(() => {});
  }

  function handleEscalate(id) {
    setResponses((prev) => prev.map((s) => s.id === id ? { ...s, escalated: true } : s));
    toast('Escalated to manager', { tone: 'amber' });
    api(`/feedback/${id}/escalate`, { method: 'PUT' }).catch(() => {});
  }

  function handleAddNote(id) {
    if (!noteText.trim()) return;
    const now = 'Just now';
    setResponses((prev) => prev.map((s) =>
      s.id === id
        ? { ...s, staffNotes: [...(s.staffNotes || []), { author: 'You', text: noteText.trim(), when: now }] }
        : s
    ));
    if (activeItem && activeItem.id === id) {
      setDrawerItem((prev) => ({ ...prev, staffNotes: [...(prev.staffNotes || []), { author: 'You', text: noteText.trim(), when: now }] }));
    }
    setNoteText('');
    toast.success('Note added');
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="QR Feedback"
        descriptor="Table QR survey · 3 flagged today" />


      <AlertBanner
        className="mb-6"
        action={
        <Button size="sm" variant="red">
            Review now
          </Button>
        }>

        2 low-star submissions unresolved for over 30 minutes
      </AlertBanner>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <SectionHeader index="01" title="Internal routing" descriptor="Low-star inbox" />
          <div className="space-y-4">
            {responses.map((s) =>
            <Card
              key={s.id}
              className={!s.resolved ? 'border-l-[3px] border-l-status-red' : ''}>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-[15px] font-bold text-ink">{s.guest}</h3>
                    <Pill tone="neutral">{s.table}</Pill>
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) =>
                    <StarIcon
                      key={i}
                      className={`h-3.5 w-3.5 ${
                      i < s.rating ? 'fill-status-red text-status-red' : 'text-line'}`
                      } />

                    )}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-meta">{s.when}</span>
                </div>

                <p className="mt-3 text-sm leading-6 text-ink">{s.comment}</p>

                <div className="mt-4 flex items-center gap-2">
                  {s.resolved ?
                <Pill tone="green" dot>
                      Resolved
                    </Pill> :

                s.escalated ?
                <Pill tone="amber" dot>
                      Escalated
                    </Pill> :

                <>
                      <Button size="sm" variant="outline" onClick={() => handleEscalate(s.id)}>
                        Escalate
                      </Button>
                      <Button size="sm" variant="green" onClick={() => handleResolve(s.id)}>
                        Mark resolved
                      </Button>
                    </>
                }
                  <Button size="sm" variant="quiet" onClick={() => { setDrawerItem(s); setNoteText(''); }}>
                    View details
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>

        <div>
          <SectionHeader index="02" title="Guest survey" descriptor="What guests see" />
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Scanned from the table QR
            </p>
            <SurveyPreview />
          </div>
        </div>
      </div>

      <Drawer
        open={!!activeItem}
        onClose={() => setDrawerItem(null)}
        title={activeItem ? activeItem.guest : ''}
        subtitle={activeItem ? `${activeItem.table} · ${activeItem.when}` : ''}
        footer={
          activeItem && (
            <div className="flex items-center gap-2">
              {!activeItem.resolved && (
                <Button size="sm" variant="green" onClick={() => handleResolve(activeItem.id)}>
                  Mark resolved
                </Button>
              )}
              {!activeItem.escalated && !activeItem.resolved && (
                <Button size="sm" variant="outline" onClick={() => handleEscalate(activeItem.id)}>
                  Escalate to manager
                </Button>
              )}
              {activeItem.resolved &&
                <Pill tone="green" dot>Resolved</Pill>
              }
              {activeItem.escalated &&
                <Pill tone="amber" dot>Escalated</Pill>
              }
            </div>
          )
        }>

        {activeItem &&
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Rating</p>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) =>
                  <StarIcon
                    key={i}
                    className={`h-4 w-4 ${
                      i < activeItem.rating ? 'fill-status-red text-status-red' : 'text-line'
                    }`} />
                )}
              </span>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Feedback</p>
              <p className="text-sm leading-6 text-ink">{activeItem.comment}</p>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">Staff notes</p>
              <div className="space-y-3">
                {(activeItem.staffNotes || []).map((note, idx) =>
                  <div key={idx} className="rounded-xl border border-line bg-canvas px-4 py-3">
                    <p className="text-sm leading-6 text-ink">{note.text}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-meta">{note.author}</span>
                      <span className="text-[11px] text-meta">·</span>
                      <span className="text-[11px] text-meta">{note.when}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Field label="Add note">
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Internal note for staff…"
                  className="w-full rounded-xl border border-line bg-canvas p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="dark" onClick={() => handleAddNote(activeItem.id)}>
                  Add note
                </Button>
              </div>
            </div>
          </div>
        }
      </Drawer>
    </div>);

}
