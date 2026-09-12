import { useEffect, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill, StatusDot } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { Field, Toggle, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import {
  bookingSlots,
  bookingTables,
  reservations as reservationsData,
  waitlist as waitlistData,
  guests,
  guestTimeline,
  bookingTimeSlots,
  bookingSections } from
'../data/manage';

const statusTone = {
  Confirmed: 'blue',
  Seated: 'green',
  'No-show': 'red'
};

const UNIT_H = 96;
const CELL_INSET = 4;

const tierTone = {
  VIP: 'red',
  Regular: 'blue',
  New: 'green'
};

function profileFor(name) {
  const found = guests.find((g) => g.name === name) ||
    guests.find((g) => name.startsWith(g.name.split(' ')[0])) ||
    guests.find((g) => g.name.startsWith(name.split(' ')[0].slice(0, 3)));
  if (found) return found;
  return {
    name,
    initials: name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    visits: 1,
    lastVisit: 'First visit',
    avgSpend: '—',
    tier: 'New',
    segment: ['New'],
    note: 'Guest profile synced from booking.',
    phone: '—'
  };
}

function BookingCard({ res, top, animate, onOpen }) {
  const finalHeight = res.duration * UNIT_H - CELL_INSET * 2;
  const [height, setHeight] = useState(
    animate ? UNIT_H - CELL_INSET * 2 : finalHeight
  );

  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setHeight(finalHeight));
    return () => cancelAnimationFrame(id);
  }, [animate, finalHeight]);

  return (
    <article
      onClick={onOpen}
      className="absolute left-0 w-full cursor-pointer overflow-hidden rounded-xl border border-line bg-canvas p-3 transition-[height,border-color] duration-300 ease-soft hover:border-ink/30"
      style={{ top, height }}>
      
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-tight text-ink">
            {res.guest}
          </h3>
          <StatusDot tone={statusTone[res.status]} className="mt-1.5" />
        </div>
        <p className="mt-1 text-xs text-meta">
          {res.covers} covers · {res.duration}h
        </p>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-meta">
          {res.status}
        </p>
      </article>
  );
}

export function Bookings() {
  const toast = useToast();

  const [reservationList, setReservationList] = useState(reservationsData);
  const [waitlistState, setWaitlistState] = useState(waitlistData);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [guestQuery, setGuestQuery] = useState('');
  const [addInline, setAddInline] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [bookingDate, setBookingDate] = useState('2026-09-10');
  const [bookingTime, setBookingTime] = useState(null);
  const [bookingTable, setBookingTable] = useState(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [depositRequired, setDepositRequired] = useState(false);
  const [profile, setProfile] = useState(null);
  const [recentKey, setRecentKey] = useState(null);

  function openNewBooking() {
    setGuestQuery('');
    setAddInline(false);
    setGuestName('');
    setPartySize(2);
    setBookingDate('2026-09-10');
    setBookingTime(null);
    setBookingTable(null);
    setSpecialRequests('');
    setDepositRequired(false);
    setBookingOpen(true);
  }

  const guestSearchResults = guestQuery.length > 0
  ? guests.filter((g) => g.name.toLowerCase().includes(guestQuery.toLowerCase()))
  : [];

  function handleCreateBooking() {
    const name = addInline ? guestName.trim() : (guestSearchResults[0]?.name || 'Guest');
    const timeIdx = bookingTimeSlots.indexOf(bookingTime);
    const dinnerIdx = timeIdx >= 5 ? Math.floor((timeIdx - 5) / 2) : 0;
    const newRes = {
      guest: name,
      covers: partySize,
      table: bookingTable || bookingTables[0],
      start: Math.max(0, dinnerIdx),
      duration: 1,
      status: 'Confirmed'
    };
    setReservationList((p) => [...p, newRes]);
    setRecentKey(`${newRes.table}|${newRes.guest}|${newRes.start}`);
    toast('Booking confirmed · ' + name, { tone: 'green' });
    setBookingOpen(false);
  }

  function handleNotifyWaitlist(name) {
    toast(`${name} · reminder sent`, { tone: 'dark' });
  }

  function handleSeatWaitlist(name) {
    setWaitlistState((p) => p.filter((w) => w.name !== name));
    toast(`${name} seated`, { tone: 'green' });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Bookings"
        descriptor="Thursday 10 Sep · 24 covers booked · 4 waiting">
        
        <Button variant="outline" onClick={openNewBooking}>Day view</Button>
        <Button variant="dark" onClick={openNewBooking}>New booking</Button>
      </PageHeader>

      <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface p-4">
        <div className="min-w-[760px]">
          <div className="flex">
            <div className="w-[72px] shrink-0">
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                &nbsp;
              </div>
              <div className="relative" style={{ height: bookingSlots.length * UNIT_H }}>
                {bookingSlots.map((slot, i) =>
                  <div key={slot} className="absolute inset-x-0 border-t border-line" style={{ top: i * UNIT_H }} />
                )}
                <div className="absolute inset-x-0 bottom-0 border-t border-line" />
                {bookingSlots.map((slot, i) =>
                  <div
                    key={slot}
                    className="absolute inset-x-0 flex items-start justify-end pr-2 pt-1.5 font-mono text-xs text-meta"
                    style={{ top: i * UNIT_H, height: UNIT_H }}>
                    {slot}
                  </div>
                )}
              </div>
            </div>

            {bookingTables.map((table) => {
              const tableRes = reservationList.filter((r) => r.table === table);
              return (
                <div key={table} className="min-w-0 flex-1 px-2">
                  <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    {table}
                  </div>
                  <div className="relative" style={{ height: bookingSlots.length * UNIT_H }}>
                    {bookingSlots.map((slot, i) =>
                      <div key={slot} className="absolute inset-x-0 border-t border-line" style={{ top: i * UNIT_H }} />
                    )}
                    <div className="absolute inset-x-0 bottom-0 border-t border-line" />
                    {bookingSlots.map((slot, i) => {
                      const busy = tableRes.some((r) => r.start <= i && i < r.start + r.duration);
                      if (busy) return null;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={openNewBooking}
                          className="absolute left-0 flex w-full items-center justify-center rounded-xl border border-dashed border-line text-xs text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink"
                          style={{ top: i * UNIT_H + CELL_INSET, height: UNIT_H - CELL_INSET * 2 }}>
                          + Book
                        </button>
                      );
                    })}
                    {tableRes.map((r) => (
                      <BookingCard
                        key={`${r.table}|${r.guest}|${r.start}`}
                        res={r}
                        top={r.start * UNIT_H}
                        animate={recentKey === `${r.table}|${r.guest}|${r.start}`}
                        onOpen={() => setProfile(profileFor(r.guest))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink">
            Waitlist
          </h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-meta">
            {waitlistState.length} parties · avg quote 22 min
          </span>
        </div>
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
          {waitlistState.map((w) =>
          <article
            key={w.name}
            onClick={() => setProfile(profileFor(w.name))}
            className="min-w-[230px] shrink-0 cursor-pointer rounded-card border border-line bg-surface p-4 transition-colors duration-150 ease-soft hover:border-ink/30">
            
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-bold text-ink">{w.name}</h3>
                <Pill tone="amber">{w.party}p</Pill>
              </div>
              <p className="mt-1.5 text-sm text-meta">
                Waiting {w.waited} · quoted {w.quoted}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleNotifyWaitlist(w.name); }}>
                  Notify
                </Button>
                <Button size="sm" variant="green" onClick={(e) => { e.stopPropagation(); handleSeatWaitlist(w.name); }}>
                  Seat
                </Button>
              </div>
            </article>
          )}
        </div>
      </section>

      <Drawer
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="New booking"
        subtitle="Create a reservation"
        footer={
        <>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="green"
              full
              disabled={!bookingTime}
              onClick={handleCreateBooking}>
              Confirm booking
            </Button>
          </>
        }>
        
        <div className="space-y-5">
            {!addInline ? (
              <Field label="Guest">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta" />
                  <input
                    type="search"
                    className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                    placeholder="Search existing guest"
                    value={guestQuery}
                    onChange={(e) => setGuestQuery(e.target.value)} />
                  
                </div>
                {guestSearchResults.length > 0 &&
                <div className="mt-1.5 space-y-1 rounded-xl border border-line bg-surface p-1.5">
                    {guestSearchResults.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => {
                          setGuestQuery(g.name);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ease-soft hover:bg-canvas">
                        
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-[10px] font-bold text-ink">
                          {g.initials}
                        </span>
                        <span className="font-semibold text-ink">{g.name}</span>
                      </button>
                    ))}
                  </div>
                }
              </Field>
            ) : (
              <Field label="Guest name">
                <input
                  className={inputClass}
                  placeholder="Full name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)} />
              </Field>
            )}

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Add new guest</p>
                <p className="text-xs text-meta">Type name inline instead of searching</p>
              </div>
              <Toggle checked={addInline} onChange={setAddInline} label="Add new guest" />
            </div>

            <Field label="Party size">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPartySize((s) => Math.max(1, s - 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                  
                  −
                </button>
                <span className="flex-1 text-center font-mono text-3xl font-extrabold text-ink">
                  {partySize}
                  <span className="ml-1 text-base text-meta">guests</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPartySize((s) => s + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-ink/30">
                  
                  +
                </button>
              </div>
            </Field>

            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)} />
            </Field>

            <Field label="Time">
              <div className="flex flex-wrap gap-2">
                {bookingTimeSlots.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBookingTime(t)}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                    bookingTime === t
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:text-ink'}`}>
                    
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Table / section">
              <div className="flex flex-wrap gap-2">
                {[...bookingTables, ...bookingSections].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBookingTable(t)}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                    bookingTable === t
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-meta hover:text-ink'}`}>
                    
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Special requests">
              <textarea
                rows={3}
                className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-meta focus:border-ink focus:outline-none"
                placeholder="Allergies, high chair, window seat…"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)} />
            </Field>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Deposit required</p>
                <p className="text-xs text-meta">Request advance payment to secure booking</p>
              </div>
              <Toggle checked={depositRequired} onChange={setDepositRequired} label="Deposit required" />
            </div>
          </div>
      </Drawer>

      {profile &&
      <DetailDrawer
        open
        onClose={() => setProfile(null)}
        title={profile.name}
        footer={
        <>
            <Button variant="dark" full onClick={() => { toast('Booking opened for ' + profile.name, { tone: 'dark' }); setProfile(null); openNewBooking(); }}>
              New booking
            </Button>
          </>
        }>

        <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-base font-bold text-ink ring-1 ring-line">
              {profile.initials}
            </span>
            <div>
              <Pill tone={tierTone[profile.tier] || 'green'} dot>{profile.tier}</Pill>
              <p className="mt-1.5 text-sm font-semibold text-ink">
                {profile.visits} visits · {profile.lastVisit}
              </p>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-line">
            <DetailRow label="Avg spend" value={profile.avgSpend} mono tone="green" />
            <DetailRow label="Segments"
              value={profile.segment.filter((s) => s !== profile.tier).join(', ')} />
            <DetailRow label="Preferred table" value={profile.preferred || '—'} />
          </dl>

          {profile.note &&
          <DetailSection title="Notes">
              <div className="rounded-xl border border-line bg-canvas p-3 text-sm text-ink">
                {profile.note}
              </div>
            </DetailSection>
          }

          <DetailSection title="Recent visits">
            <div className="overflow-hidden rounded-xl border border-line">
              {guestTimeline.map((v, i) => (
                <div key={i} className="flex gap-3 border-b border-line bg-canvas px-4 py-3 last:border-b-0">
                  <span className="shrink-0 font-mono text-xs font-semibold text-meta">{v.date}</span>
                  <span className="text-sm text-ink">{v.detail}</span>
                </div>
              ))}
            </div>
          </DetailSection>
      </DetailDrawer>
      }
    </div>);

}
