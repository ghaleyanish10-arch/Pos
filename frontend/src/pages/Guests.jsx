import { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, FilterChips, SearchInput, Toggle, inputClass } from '../components/ui/Controls';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Pill } from '../components/ui/Pill';
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table';
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
  initials: g.initials || g.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || g.name.slice(0, 2).toUpperCase(),
  visits: g.visits || 0,
  lastVisit: fmtVisit(g.last_visit),
  avgSpend: `Rs ${Number(g.avg_spend || 0).toLocaleString('en-IN')}`,
  tier: g.tier || 'New',
  segment: Array.isArray(g.segments) ? g.segments : [],
  note: g.note || undefined
});

export function Guests() {
  const [segment, setSegment] = useState('All');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [guestList, setGuestList] = useState(guestsData);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/guests');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) setGuestList(data.map(fromApi));
      } catch {
        /* keep static demo data as fallback */
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

  const rows = guestList.filter(
    (g) =>
    (segment === 'All' || (g.segment || []).includes(segment)) &&
    g.name.toLowerCase().includes(query.toLowerCase())
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

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Guests" descriptor={`${(2418 + guestList.length - guestsData.length).toLocaleString()} profiles · 312 active this month`}>
        <Button variant="dark" onClick={openAddGuest}>Add guest</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips
          ariaLabel="Guest segment"
          options={['All', 'New', 'Regulars', 'VIP', 'Birthday this month']}
          value={segment}
          onChange={setSegment} />
        
        <SearchInput
          className="ml-auto w-full max-w-[260px]"
          placeholder="Search guests"
          value={query}
          onChange={setQuery} />
        
      </div>

      <TableWrap>
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
            <Tr key={g.name} onClick={() => setActive(g)}>
                <Td>
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink">
                      {g.initials}
                    </span>
                    <span className="font-semibold">{g.name}</span>
                  </span>
                </Td>
                <Td className="font-mono text-sm">{g.visits}</Td>
                <Td className="text-sm text-meta">{g.lastVisit}</Td>
                <Td className="font-mono text-sm font-semibold">{g.avgSpend}</Td>
                <Td>
                  <Pill tone={tierTone[g.tier]}>{g.tier}</Pill>
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline">
                    Profile
                  </Button>
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </TableWrap>

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.name ?? ''}
        subtitle={
        active ? `${active.visits} visits · avg ${active.avgSpend} · ${active.tier}` : ''
        }
        footer={
        <>
            <Button variant="outline" onClick={() => setActive(null)}>
              Close
            </Button>
            <Button variant="dark" full>
              Start booking
            </Button>
          </>
        }>
        
        {active &&
        <div className="space-y-6">
            {active.note && <AlertBanner>{active.note}</AlertBanner>}

            <section>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
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

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Notes
              </h3>
              <textarea
              rows={4}
              defaultValue={active.note}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
              placeholder="Preferences, allergies, seating…" />
            
            </section>
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
                onChange={(e) => setFormName(e.target.value)} />
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
