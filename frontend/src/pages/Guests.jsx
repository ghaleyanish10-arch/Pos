import { useEffect, useState } from 'react';
import { SearchXIcon, UserPlusIcon, UsersIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, FilterChips, SearchInput, Toggle, inputClass } from '../components/ui/Controls';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
import { DetailRow } from '../components/ui/DetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { guestTimeline, guests as guestsData } from '../data/manage';
import api from '../api/client';

const tierTone = {
  VIP: 'purple',
  Regular: 'blue',
  New: 'neutral'
};

const fmtVisit = (iso) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fromApi = (g) => ({
  id: g.id,
  name: g.name,
  email: g.email || '',
  phone: g.phone || '',
  initials: g.initials || g.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || g.name.slice(0, 2).toUpperCase(),
  visits: g.visits || 0,
  lastVisit: fmtVisit(g.last_visit),
  avgSpend: `Rs ${Number(g.avg_spend || 0).toLocaleString('en-IN')}`,
  tier: g.tier || 'New',
  segment: Array.isArray(g.segments) ? g.segments : (typeof g.segments === 'string' ? safeSegments(g.segments) : []),
  note: g.note || undefined
});

function safeSegments(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function Guests() {
  const [segment, setSegment] = useState('All');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [editing, setEditing] = useState(false);
  const [guestList, setGuestList] = useState(guestsData);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const toast = useToast();

  // Edit form state lives on the detail drawer — edit without leaving the page.
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const res = await api('/guests');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) setGuestList(data.map(fromApi));
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('ready'); // demo data keeps the page usable offline
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formBirthday, setFormBirthday] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formConsent, setFormConsent] = useState(false);

  const totalVisits = guestList.reduce((s, g) => s + g.visits, 0);
  const vips = guestList.filter((g) => g.tier === 'VIP').length;

  const rows = guestList.filter(
    (g) =>
    (segment === 'All' || (g.segment || []).includes(segment) || g.tier === segment) &&
    (g.name.toLowerCase().includes(query.toLowerCase()) ||
      (g.phone || '').includes(query) ||
      (g.email || '').toLowerCase().includes(query.toLowerCase()))
  );

  function openAddGuest() {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormBirthday('');
    setFormTags('');
    setFormConsent(false);
    setAddOpen(true);
  }

  function openEdit(guest) {
    setDraft({
      id: guest.id,
      name: guest.name,
      phone: guest.phone || '',
      email: guest.email || '',
      tier: guest.tier,
      note: guest.note || ''
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!draft?.name.trim()) {
      toast('Name cannot be empty', { tone: 'red' });
      return;
    }
    const prev = guestList;
    setGuestList((p) =>
      p.map((g) =>
        g.id === draft.id
          ? { ...g, name: draft.name.trim(), phone: draft.phone, email: draft.email, tier: draft.tier, note: draft.note || undefined, initials: draft.name.trim().split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() }
          : g
      ));
    setActive((a) => (a && a.id === draft.id ? { ...a, ...draft, name: draft.name.trim() } : a));
    setEditing(false);
    toast(`${draft.name.trim()} updated`, { tone: 'green' });
    try {
      await api(`/guests/${draft.id}`, {
        method: 'PUT',
        body: { name: draft.name.trim(), phone: draft.phone, email: draft.email, tier: draft.tier, note: draft.note }
      });
    } catch {
      setGuestList(prev);
      toast('Could not save changes — check connection', { tone: 'red' });
    }
  }

  function handleAddGuest() {
    const parts = formName.trim().split(' ');
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : formName.trim().slice(0, 2).toUpperCase();
    const newGuest = {
      name: formName.trim(),
      initials,
      visits: 0,
      lastVisit: 'Never',
      avgSpend: 'Rs 0',
      tier: 'New',
      segment: ['New'],
      note: formTags || undefined
    };
    setGuestList((p) => [...p, newGuest]);
    toast('Guest added', { tone: 'green' });
    setAddOpen(false);
    api('/guests', {
      method: 'POST',
      body: {
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        segments: ['New'],
        note: formTags || ''
      }
    })
      .then((res) => {
        if (res?.id) {
          setGuestList((prev) => prev.map((g) => (g === newGuest ? fromApi(res) : g)));
        }
      })
      .catch(() => {});
  }

  const listState = loadState === 'loading'
    ? 'loading'
    : rows.length === 0
      ? 'empty'
      : 'ready';

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Guests" descriptor={`${guestList.length} profiles · ${totalVisits.toLocaleString()} lifetime visits · ${vips} VIPs`}>
        <Button variant="dark" icon={<UserPlusIcon className="h-4 w-4" />} onClick={openAddGuest}>Add guest</Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-caption font-semibold text-meta">Profiles</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{guestList.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-caption font-semibold text-meta">VIPs</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{vips}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-caption font-semibold text-meta">Avg spend</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">
            Rs {Math.round(guestList.reduce((s, g) => s + (Number(String(g.avgSpend).replace(/\D/g, '')) || 0), 0) / Math.max(guestList.length, 1)).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-caption font-semibold text-meta">New this month</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{guestList.filter((g) => g.tier === 'New').length}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips
          ariaLabel="Guest segment"
          options={['All', 'New', 'Regulars', 'VIP', 'Birthday this month']}
          value={segment}
          onChange={setSegment} />
        <SearchInput
          className="ml-auto w-full max-w-[260px]"
          placeholder="Search name, phone, email"
          value={query}
          onChange={setQuery} />
      </div>

      <TableWrap>
        {listState === 'loading' ? (
          <EmptyState loading title="Loading guests" description="Fetching guest profiles…" />
        ) : listState === 'empty' ? (
          <EmptyState
            icon={query ? <SearchXIcon className="h-6 w-6" /> : <UsersIcon className="h-6 w-6" />}
            title={query ? `No guests match "${query}"` : segment === 'All' ? 'No guests yet' : `No ${segment.toLowerCase()} guests`}
            description={query
              ? 'Try a different name, phone or email — or add them as a new guest.'
              : 'Guest profiles build up automatically from visits and bookings.'}
            action={
              query
                ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setSegment('All'); }}>Clear search</Button>
                : <Button variant="dark" size="sm" icon={<UserPlusIcon className="h-4 w-4" />} onClick={openAddGuest}>Add guest</Button>
            } />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Guest</Th>
                <Th>Visits</Th>
                <Th>Last visit</Th>
                <Th>Average spend</Th>
                <Th>Tier</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((g) =>
              <Tr key={g.id || g.name} onClick={() => setActive(g)}>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink">
                        {g.initials}
                      </span>
                      <span>
                        <span className="block font-semibold">{g.name}</span>
                        {(g.phone || g.email) &&
                      <span className="block text-caption text-meta">{g.phone || g.email}</span>
                      }
                      </span>
                    </span>
                  </Td>
                  <Td className="font-mono text-sm">{g.visits}</Td>
                  <Td className="text-sm text-meta">{g.lastVisit}</Td>
                  <Td className="font-mono text-sm font-semibold">{g.avgSpend}</Td>
                  <Td>
                    <Pill tone={tierTone[g.tier]}>{g.tier}</Pill>
                  </Td>
                  <Td className="text-right">
                    <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActive(g);
                    }}>
                    Profile
                  </Button>
                  </Td>
                </Tr>
              )}
            </tbody>
          </Table>
        )}
      </TableWrap>

      {/* Detail drawer: view → inline edit without page navigation */}
      <Drawer
        open={!!active}
        onClose={() => { setActive(null); setEditing(false); }}
        title={active?.name ?? ''}
        subtitle={
        active ? `${active.visits} visits · avg ${active.avgSpend} · ${active.tier}` : ''
        }
        footer={
        editing ? (
          <>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel edit</Button>
              <Button variant="green" full onClick={saveEdit}>Save changes</Button>
            </>
        ) : (
          <>
              <Button variant="outline" onClick={() => setActive(null)}>Close</Button>
              <Button variant="outline" onClick={() => openEdit(active)}>Edit profile</Button>
              <Button variant="dark" full>Start booking</Button>
            </>
        )
        }>
        {active &&
        <div className="space-y-6">
            {editing && draft ? (
            <div className="space-y-4">
                <Field label="Name">
                  <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input className={inputClass} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                  </Field>
                  <Field label="Tier">
                    <select className={inputClass} value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
                      <option>New</option>
                      <option>Regular</option>
                      <option>VIP</option>
                    </select>
                  </Field>
                </div>
                <Field label="Email">
                  <input type="email" className={inputClass} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </Field>
                <Field label="Notes">
                  <textarea
                  rows={3}
                  className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="Preferences, allergies, seating…" />
                </Field>
              </div>
            ) : (
            <>
                {active.note && <AlertBanner tone="blue">{active.note}</AlertBanner>}

                <dl className="divide-y divide-line rounded-xl border border-line bg-canvas px-4">
                  <DetailRow label="Phone" value={active.phone || '—'} />
                  <DetailRow label="Email" value={active.email || '—'} />
                  <DetailRow label="Lifetime visits" value={active.visits} mono />
                  <DetailRow label="Average spend" value={active.avgSpend} mono tone="green" />
                </dl>

                <section>
                  <h3 className="mb-3 text-caption font-semibold text-meta">
                Visit history
                  </h3>
                  <ol className="relative space-y-4 border-l border-line pl-5">
                    {guestTimeline.map((v) =>
                  <li key={v.date} className="relative">
                        <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-ink" />
                        <p className="font-mono text-xs text-meta">{v.date}</p>
                        <p className="text-sm text-ink">{v.detail}</p>
                      </li>
                  )}
                  </ol>
                </section>
              </>
            )}
          </div>
        }
      </Drawer>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add guest"
        subtitle="Create a new guest profile"
        footer={
        <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="green"
              full
              disabled={!formName.trim()}
              onClick={handleAddGuest}>
              Save guest
            </Button>
          </>
        }>
        <div className="space-y-5">
            <Field label="Name">
              <input
              className={inputClass}
              placeholder="Full name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus />
            </Field>
            <Field label="Phone">
              <input
              className={inputClass}
              placeholder="+977 98XXXXXXXX"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)} />
            </Field>
            <Field label="Email">
              <input
              type="email"
              className={inputClass}
              placeholder="name@email.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)} />
            </Field>
            <Field label="Birthday">
              <input
              type="date"
              className={inputClass}
              value={formBirthday}
              onChange={(e) => setFormBirthday(e.target.value)} />
            </Field>
            <Field label="Tags / notes">
              <textarea
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
              placeholder="Preferences, allergies, dietary notes…"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)} />
            </Field>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Marketing consent</p>
                <p className="text-xs text-meta">Allow email & SMS promotions</p>
              </div>
              <Toggle checked={formConsent} onChange={setFormConsent} label="Marketing consent" />
            </div>
          </div>
      </Drawer>
    </div>);

}
