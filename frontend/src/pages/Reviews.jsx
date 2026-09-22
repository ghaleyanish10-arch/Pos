import { useState, useEffect } from 'react';
import { StarIcon, CheckIcon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FilterChips } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { StatRow } from '../components/ui/StatCard';
import { Dialog } from '../components/ui/Dialog';
import { useToast } from '../components/ui/Toast';
import { reviews } from '../data/orm';
import api from '../api/client';

function Stars({ rating }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) =>
      <StarIcon
        key={i}
        className={`h-3.5 w-3.5 ${i < rating ? 'fill-status-amber text-status-amber' : 'text-line'}`} />

      )}
    </span>);

}

const platformTone = {
  Google: 'bg-tint-blue text-status-blue',
  TripAdvisor: 'bg-tint-green text-status-green',
  Facebook: 'bg-tint-purple text-status-purple',
  'QR Survey': 'bg-canvas text-meta'
};

const platforms = [
  { name: 'Google', permissions: ['Read & reply to reviews', 'View business profile', 'Respond to messages'] },
  { name: 'TripAdvisor', permissions: ['Read & reply to reviews', 'Manage listing details', 'View analytics'] },
  { name: 'Facebook', permissions: ['Read & reply to reviews', 'Manage page posts', 'Respond to messages'] }
];

const sentimentChips = {
  positive: ['Thank you for your kind words!', 'We\'re so glad you enjoyed it!', 'Hope to see you again soon!'],
  neutral: ['Thanks for your feedback!', 'We appreciate you sharing this.', 'Noted — we\'ll look into it.'],
  negative: ['We\'re sorry about your experience.', 'Thank you for letting us know.', 'We\'d like to make this right.']
};

function getSentiment(rating) {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

export function Reviews() {
  const [filter, setFilter] = useState('All');
  const toast = useToast();

  const [connections, setConnections] = useState({
    Google: false,
    TripAdvisor: false,
    Facebook: false
  });
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [consentPlatform, setConsentPlatform] = useState(null);
  const [replies, setReplies] = useState({});
  const [replyTexts, setReplyTexts] = useState({});
  const [reviewsList, setReviewsList] = useState(reviews);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/reviews');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) setReviewsList(data.map((g) => ({
          id: g.id,
          author: g.author || '',
          platform: g.platform || '',
          rating: g.rating || 0,
          text: g.text || '',
          answered: !!g.answered,
          reply: g.reply || '',
          when: new Date(g.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          stale: false,
        })));
      } catch {
        /* keep static reviews as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = reviewsList.filter((r) => {
    if (filter === 'Unanswered') return !r.answered;
    if (filter === 'Low ratings') return r.rating <= 3;
    if (filter === 'All') return true;
    return r.platform === filter;
  });

  function handleConsentConnect() {
    setConnections((prev) => ({ ...prev, [consentPlatform.name]: true }));
    toast.success(`${consentPlatform.name} connected`);
    setConsentPlatform(null);
  }

  function handlePostReply(reviewId) {
    const text = replyTexts[reviewId];
    if (!text || !text.trim()) return;
    setReplies((prev) => ({
      ...prev,
      [reviewId]: [...(prev[reviewId] || []), { text: text.trim(), when: 'Just now' }]
    }));
    setReplyTexts((prev) => ({ ...prev, [reviewId]: '' }));
    toast.success('Reply posted');
    api(`/reviews/${reviewId}/reply`, { method: 'PUT', body: { reply: text.trim() } }).catch(() => {});
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Reviews" descriptor="All platforms · last 30 days">
        <Button variant="outline" onClick={() => setConnectDialogOpen(true)}>
          Connect platform
        </Button>
      </PageHeader>

      <div className="mb-5">
        <StatRow
          stats={[
          { label: 'Average rating', value: '4.6', meta: '+0.2 vs last month' },
          { label: 'Reviews this month', value: '38', meta: '12 Google · 9 TripAdvisor' },
          { label: 'Response rate', value: '82%', meta: 'Target 90%' },
          { label: 'Unanswered', value: '3', meta: '2 older than 24h' }]
          } />

      </div>

      <div className="mb-4">
        <FilterChips
          ariaLabel="Review filter"
          options={['All', 'Unanswered', 'Low ratings', 'Google', 'TripAdvisor', 'Facebook', 'QR Survey']}
          value={filter}
          onChange={setFilter} />

      </div>

      <div className="space-y-4">
        {rows.map((r) => {
          const existingReplies = replies[r.id] || [];
          const sentiment = getSentiment(r.rating);
          const chips = sentimentChips[sentiment];

          return (
            <Card
              key={r.id}
              className={r.stale && !r.answered ? 'border-l-[3px] border-l-status-amber' : ''}>

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-15 font-bold text-ink">{r.author}</h3>
                  <span
                  className={`rounded-full px-2.5 py-1 text-caption font-semibold ${platformTone[r.platform]}`}>

                    {r.platform}
                  </span>
                  <Stars rating={r.rating} />
                </div>
                <span className="text-xs font-semibold text-meta">{r.when}</span>
              </div>

              <p className="mt-3 text-sm leading-6 text-ink">{r.text}</p>

              {r.answered && existingReplies.length === 0 ?
            <div className="mt-3 flex items-center gap-2">
                  <Pill tone="green" dot>
                    Replied
                  </Pill>
                  <span className="text-xs text-meta">by Riya · 1 day ago</span>
                </div> :

            <div className="mt-4 flex flex-col gap-3">
                  {existingReplies.map((rp, idx) =>
                  <div key={idx} className="rounded-xl border border-line bg-canvas px-4 py-3">
                        <p className="text-sm leading-6 text-ink">{rp.text}</p>
                        <span className="mt-1 block text-caption text-meta">Posted {rp.when}</span>
                      </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <textarea
                      rows={2}
                      placeholder="Write a reply…"
                      aria-label={`Reply to ${r.author}`}
                      value={replyTexts[r.id] || ''}
                      onChange={(e) => setReplyTexts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none" />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip) =>
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setReplyTexts((prev) => ({ ...prev, [r.id]: chip }))}
                      className="rounded-full border border-line bg-shelf px-3 py-1.5 text-xs font-semibold text-meta transition-colors duration-150 ease-soft hover:border-ink/40 hover:text-ink">
                        {chip}
                      </button>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button size="md" variant="outline">
                      Draft with AI
                    </Button>
                    <Button size="md" variant="dark" onClick={() => handlePostReply(r.id)}>
                      Post reply
                    </Button>
                  </div>
                </div>
            }
            </Card>
          );
        })}
      </div>

      <Dialog
        open={connectDialogOpen}
        onClose={() => setConnectDialogOpen(false)}
        title="Connect platform"
        subtitle="Choose a platform to connect to Mesa OS">
        <div className="space-y-3">
          {platforms.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => { setConnectDialogOpen(false); setConsentPlatform(p); }}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors duration-150 ease-soft hover:border-ink/30 ${
                connections[p.name]
                  ? 'border-status-green bg-tint-green/30'
                  : 'border-line bg-canvas'
              }`}>
              <div>
                <span className="text-sm font-bold text-ink">{p.name}</span>
              </div>
              {connections[p.name] ?
                <Pill tone="green" dot>Connected</Pill>
                :
                <Pill tone="neutral">Not connected</Pill>
              }
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={!!consentPlatform}
        onClose={() => setConsentPlatform(null)}
        title={`Connect ${consentPlatform?.name || ''}`}
        subtitle="Review permissions and connect">
        {consentPlatform &&
          <div>
            <p className="mb-3 text-sm text-meta">This app will request the following permissions:</p>
            <ul className="mb-5 space-y-2">
              {consentPlatform.permissions.map((perm) => (
                <li key={perm} className="flex items-center gap-2 text-sm text-ink">
                  <CheckIcon className="h-4 w-4 shrink-0 text-status-green" />
                  {perm}
                </li>
              ))}
            </ul>
          </div>
        }
        <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5 -mx-5 -mb-4 mt-0">
          <Button variant="outline" onClick={() => setConsentPlatform(null)}>
            Cancel
          </Button>
          <Button variant="green" onClick={handleConsentConnect}>
            Connect
          </Button>
        </footer>
      </Dialog>
    </div>);

}
