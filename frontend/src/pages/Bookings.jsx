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
  'No-show': 'red',
  Cancelled: 'gray'
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

function BookingCard({ res, top, height: cardHeight, animate, onOpen, onCancel }) {
  const finalHeight = cardHeight !== undefined
    ? cardHeight
    : res.duration * UNIT_H - CELL_INSET * 2;
  const [height, setHeight] = useState(
    animate ? UNIT_H - CELL_INSET * 2 : finalHeight
  );

  useEffect(() => {
    if (!animate) {
      setHeight(finalHeight);
      return;
    }
    const id = requestAnimationFrame(() => setHeight(finalHeight));
    return () => cancelAnimationFrame(id);
  }, [animate, finalHeight]);

  const displayTime = res.time || (res.start !== undefined ? `${17 + Math.floor(res.start)}:${(res.start % 1) * 60 === 30 ? '30' : '00'}` : '');

  return (
    <article
      onClick={onOpen}
      className="group absolute left-0 w-full cursor-pointer overflow-hidden rounded-xl border border-line bg-canvas p-3 transition-[height,border-color] duration-300 ease-soft hover:border-ink/30 z-10"
      style={{ top, height }}>
      
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-tight text-ink truncate">
            {res.guest}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {onCancel && res.status !== 'Cancelled' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                title="Cancel booking"
                className="hidden group-hover:inline-flex h-5 px-1.5 items-center justify-center rounded-md text-[10px] font-bold border border-status-red/30 bg-status-red/10 text-status-red hover:bg-status-red hover:text-white transition-colors">
                Cancel
              </button>
            )}
            <StatusDot tone={statusTone[res.status]} className="mt-0.5" />
          </div>
        </div>
        <p className="mt-1 text-xs text-meta truncate">
          {displayTime && <span className="font-semibold text-ink">{displayTime} · </span>}
          {res.covers} covers · {res.duration}h
        </p>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-meta">
            {res.status}
          </p>
          <span className="text-[10px] text-meta opacity-0 group-hover:opacity-100 transition-opacity">
            Details & cancel →
          </span>
        </div>
      </article>
  );
}

export const DAY_PERIODS = [
  {
    id: 'morning',
    label: 'Morning',
    timeSpan: '08:00 – 12:00',
    startHour: 8,
    endHour: 12,
    slots: ['08:00', '09:00', '10:00', '11:00']
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    timeSpan: '12:00 – 17:00',
    startHour: 12,
    endHour: 17,
    slots: ['12:00', '13:00', '14:00', '15:00', '16:00']
  },
  {
    id: 'evening',
    label: 'Evening',
    timeSpan: '17:00 – 21:00',
    startHour: 17,
    endHour: 22,
    slots: ['17:00', '18:00', '19:00', '20:00', '21:00']
  },
  {
    id: 'night',
    label: 'Night',
    timeSpan: '21:00 – 01:00',
    startHour: 21,
    endHour: 25,
    slots: ['21:00', '22:00', '23:00', '00:00']
  },
  {
    id: 'all',
    label: 'All day',
    timeSpan: '08:00 – 00:00',
    startHour: 8,
    endHour: 24,
    slots: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
  }
];

export const ALL_BOOKING_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00',
  '21:30', '22:00', '22:30', '23:00', '23:30', '00:00'
];

function getTimePeriod(timeStr) {
  if (!timeStr) return 'evening';
  const min = timeToMinutes(timeStr);
  if (min >= 480 && min < 720) return 'morning';
  if (min >= 720 && min < 1020) return 'afternoon';
  if (min >= 1020 && min < 1260) return 'evening';
  return 'night';
}

export const defaultReservations = [
  // Morning
  { guest: 'Bikash Rai', covers: 2, table: 'T2 · 2p', time: '09:00', duration: 1, status: 'Confirmed' },
  { guest: 'Breakfast Club', covers: 4, table: 'T5 · 4p', time: '10:00', duration: 1.5, status: 'Confirmed' },

  // Afternoon
  { guest: 'Elina Gurung', covers: 4, table: 'T5 · 4p', time: '12:30', duration: 1.5, status: 'Confirmed' },
  { guest: 'Thamel Tech Lunch', covers: 6, table: 'T12 · 6p', time: '13:00', duration: 2, status: 'Confirmed' },

  // Evening
  { guest: 'Deepak Thapa', covers: 4, table: 'T5 · 4p', time: '17:00', duration: 2, status: 'Seated' },
  { guest: 'Anisha Shrestha', covers: 2, table: 'T2 · 2p', time: '18:00', duration: 1, status: 'Confirmed' },
  { guest: 'Corporate — Yeti Air', covers: 8, table: 'Terrace · 8p', time: '18:00', duration: 3, status: 'Confirmed' },
  { guest: 'Gurung family', covers: 6, table: 'T12 · 6p', time: '19:00', duration: 2, status: 'Confirmed' },
  { guest: 'Walk-in hold', covers: 2, table: 'T2 · 2p', time: '20:00', duration: 1, status: 'No-show' },
  { guest: 'Chloe Martin', covers: 2, table: 'T5 · 4p', time: '21:00', duration: 1, status: 'Confirmed' },

  // Night
  { guest: 'Late Night Lounge', covers: 6, table: 'Terrace · 8p', time: '22:00', duration: 2, status: 'Confirmed' }
];

const RESERVATIONS_KEY = 'mesa_reservations';

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function slotToMinutes(timeStr, baseHour = 0) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  let hours = h;
  if (baseHour >= 12 && hours < 6) {
    hours += 24;
  }
  return hours * 60 + (m || 0);
}

function normalizeReservation(r) {
  if (r.time) return r;
  if (r.start !== undefined && r.start !== null) {
    const h = 17 + Math.floor(r.start);
    const m = (r.start % 1) * 60;
    return {
      ...r,
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    };
  }
  return { ...r, time: '17:00' };
}

function getReservationRange(r) {
  if (r.time) {
    let startMin = timeToMinutes(r.time);
    if (r.time === '00:00' || r.time === '00:30') startMin += 24 * 60;
    const durationMin = (r.duration || 1) * 60;
    return {
      startMin,
      endMin: startMin + durationMin
    };
  }
  if (r.start !== undefined && r.start !== null) {
    const startMin = (17 + r.start) * 60;
    const durationMin = (r.duration || 1) * 60;
    return {
      startMin,
      endMin: startMin + durationMin
    };
  }
  return null;
}

function isTimeBookedForTable(table, timeStr, date, reservations, proposedDuration = 1) {
  if (!table || !timeStr) return false;
  let slotStart = timeToMinutes(timeStr);
  if (slotStart === null) return false;
  if (timeStr === '00:00' || timeStr === '00:30') slotStart += 24 * 60;
  const slotEnd = slotStart + proposedDuration * 60;

  return reservations.some((r) => {
    if (r.status === 'Cancelled') return false;
    if (r.table !== table) return false;

    const rDate = r.date || '2026-09-10';
    if (date && rDate !== date) return false;

    const range = getReservationRange(r);
    if (!range) return false;

    return slotStart < range.endMin && slotEnd > range.startMin;
  });
}

function readStoredReservations() {
  try {
    const raw = localStorage.getItem(RESERVATIONS_KEY);
    if (!raw) return defaultReservations;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Merge with defaultReservations to ensure morning/afternoon/night entries exist
      const existingKeys = new Set(parsed.map((r) => `${r.table}|${r.time || r.start}`));
      const missingDefaults = defaultReservations.filter(
        (d) => !existingKeys.has(`${d.table}|${d.time}`)
      );
      return [...parsed.map(normalizeReservation), ...missingDefaults];
    }
    return defaultReservations;
  } catch {
    return defaultReservations;
  }
}

export function Bookings() {
  const toast = useToast();

  const [reservationList, setReservationList] = useState(readStoredReservations);
  const [waitlistState, setWaitlistState] = useState(waitlistData);
  const [selectedPeriod, setSelectedPeriod] = useState('evening');
  const [drawerPeriod, setDrawerPeriod] = useState('all');

  const [bookingOpen, setBookingOpen] = useState(false);
  const [guestQuery, setGuestQuery] = useState('');
  const [addInline, setAddInline] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [duration, setDuration] = useState(1);
  const [bookingDate, setBookingDate] = useState('2026-09-10');
  const [bookingTime, setBookingTime] = useState(null);
  const [bookingTable, setBookingTable] = useState(bookingTables[0]);
  const [specialRequests, setSpecialRequests] = useState('');
  const [depositRequired, setDepositRequired] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [recentKey, setRecentKey] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservationList));
    } catch {
      /* storage unavailable */
    }
  }, [reservationList]);

  const activePeriod = DAY_PERIODS.find((p) => p.id === selectedPeriod) || DAY_PERIODS[2];
  const periodStartMin = activePeriod.startHour * 60;
  const periodEndMin = activePeriod.endHour * 60;

  const periodCovers = DAY_PERIODS.reduce((acc, period) => {
    const pStart = period.startHour * 60;
    const pEnd = period.endHour * 60;
    const covers = reservationList
      .filter((r) => {
        if (r.status === 'Cancelled') return false;
        const range = getReservationRange(r);
        if (!range) return false;
        return range.startMin < pEnd && range.endMin > pStart;
      })
      .reduce((sum, r) => sum + (r.covers || 0), 0);
    acc[period.id] = covers;
    return acc;
  }, {});

  const displayedDrawerSlots = drawerPeriod === 'all'
    ? ALL_BOOKING_TIME_SLOTS
    : ALL_BOOKING_TIME_SLOTS.filter((t) => getTimePeriod(t) === drawerPeriod);

  function openNewBooking(table = null, time = null) {
    const selectedTbl = table || bookingTables[0];
    setGuestQuery('');
    setAddInline(false);
    setGuestName('');
    setPartySize(2);
    setDuration(1);
    setBookingDate('2026-09-10');
    setBookingTable(selectedTbl);

    if (time && !isTimeBookedForTable(selectedTbl, time, '2026-09-10', reservationList, 1)) {
      setBookingTime(time);
      setDrawerPeriod(getTimePeriod(time));
    } else {
      setBookingTime(null);
      setDrawerPeriod(selectedPeriod !== 'all' ? selectedPeriod : 'all');
    }

    setSpecialRequests('');
    setDepositRequired(false);
    setBookingOpen(true);
  }

  function handleSelectTable(tbl) {
    setBookingTable(tbl);
    if (bookingTime && isTimeBookedForTable(tbl, bookingTime, bookingDate, reservationList, duration)) {
      setBookingTime(null);
    }
  }

  function handleSelectDate(d) {
    setBookingDate(d);
    if (bookingTime && isTimeBookedForTable(bookingTable, bookingTime, d, reservationList, duration)) {
      setBookingTime(null);
    }
  }

  function handleSelectDuration(dur) {
    setDuration(dur);
    if (bookingTime && isTimeBookedForTable(bookingTable, bookingTime, bookingDate, reservationList, dur)) {
      setBookingTime(null);
    }
  }

  const guestSearchResults = guestQuery.length > 0
  ? guests.filter((g) => g.name.toLowerCase().includes(guestQuery.toLowerCase()))
  : [];

  function handleCreateBooking() {
    const name = addInline ? guestName.trim() : (guestSearchResults[0]?.name || 'Guest');
    const selectedTable = bookingTable || bookingTables[0];

    if (!bookingTime) {
      toast('Please select an available booking time', { tone: 'red' });
      return;
    }

    if (isTimeBookedForTable(selectedTable, bookingTime, bookingDate, reservationList, duration)) {
      toast('That time is already booked for ' + selectedTable, { tone: 'red' });
      return;
    }

    const timeMinutes = timeToMinutes(bookingTime);
    const startOffset = Math.max(0, (timeMinutes - 17 * 60) / 60);

    const newRes = {
      guest: name,
      covers: partySize,
      table: selectedTable,
      date: bookingDate,
      time: bookingTime,
      start: startOffset,
      duration,
      status: 'Confirmed',
      specialRequests: specialRequests || undefined,
      depositRequired: depositRequired || false
    };

    setReservationList((p) => [...p, newRes]);
    setRecentKey(`${newRes.table}|${newRes.guest}|${newRes.time || newRes.start}`);
    toast('Booking confirmed · ' + name, { tone: 'green' });
    setBookingOpen(false);
  }

  function handleCancelBooking(targetRes) {
    if (!targetRes) return;
    setReservationList((prev) =>
      prev.map((r) => {
        const isMatch =
          r.table === targetRes.table &&
          (r.time === targetRes.time || r.start === targetRes.start) &&
          r.guest === targetRes.guest &&
          (r.date || '2026-09-10') === (targetRes.date || '2026-09-10');
        if (isMatch) {
          return { ...r, status: 'Cancelled' };
        }
        return r;
      })
    );
    toast(`Booking cancelled · ${targetRes.guest} (${targetRes.table})`, { tone: 'dark' });
    setProfile(null);
    setSelectedReservation(null);
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
        descriptor={`Thursday 10 Sep · ${activePeriod.label} (${activePeriod.timeSpan}) · ${periodCovers[activePeriod.id] || 0} covers booked · ${waitlistState.length} waiting`}>
        
        <div className="flex items-center rounded-xl border border-line bg-canvas p-1">
          {DAY_PERIODS.map((period) => {
            const isSelected = selectedPeriod === period.id;
            return (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriod(period.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                  isSelected
                    ? 'bg-ink text-white shadow-xs'
                    : 'text-meta hover:bg-surface hover:text-ink'
                }`}>
                <span>{period.label}</span>
                <span className={`text-[10px] font-mono ${isSelected ? 'text-white/75' : 'text-meta/70'}`}>
                  {periodCovers[period.id] || 0}c
                </span>
              </button>
            );
          })}
        </div>

        <Button variant="dark" onClick={() => openNewBooking()}>New booking</Button>
      </PageHeader>

      <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface p-4">
        <div className="min-w-[760px]">
          <div className="flex">
            <div className="w-[72px] shrink-0">
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                &nbsp;
              </div>
              <div className="relative" style={{ height: activePeriod.slots.length * UNIT_H }}>
                {activePeriod.slots.map((slot, i) =>
                  <div key={slot} className="absolute inset-x-0 border-t border-line" style={{ top: i * UNIT_H }} />
                )}
                <div className="absolute inset-x-0 bottom-0 border-t border-line" />
                {activePeriod.slots.map((slot, i) =>
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
              const tableRes = reservationList.filter((r) => {
                if (r.table !== table || r.status === 'Cancelled') return false;
                const range = getReservationRange(r);
                if (!range) return false;
                return range.startMin < periodEndMin && range.endMin > periodStartMin;
              });

              return (
                <div key={table} className="min-w-0 flex-1 px-2">
                  <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                    {table}
                  </div>
                  <div className="relative" style={{ height: activePeriod.slots.length * UNIT_H }}>
                    {activePeriod.slots.map((slot, i) =>
                      <div key={slot} className="absolute inset-x-0 border-t border-line" style={{ top: i * UNIT_H }} />
                    )}
                    <div className="absolute inset-x-0 bottom-0 border-t border-line" />
                    {activePeriod.slots.map((slot, i) => {
                      const slotStartMin = slotToMinutes(slot, activePeriod.startHour);
                      const slotStep = activePeriod.id === 'all' ? 120 : 60;
                      const slotEndMin = slotStartMin + slotStep;

                      const busy = tableRes.some((r) => {
                        const range = getReservationRange(r);
                        if (!range) return false;
                        return slotStartMin < range.endMin && slotEndMin > range.startMin;
                      });

                      if (busy) return null;

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => openNewBooking(table, slot)}
                          className="absolute left-0 flex w-full items-center justify-center rounded-xl border border-dashed border-line text-xs text-meta transition-colors duration-150 ease-soft hover:border-ink/30 hover:text-ink"
                          style={{ top: i * UNIT_H + CELL_INSET, height: UNIT_H - CELL_INSET * 2 }}>
                          + Book
                        </button>
                      );
                    })}
                    {tableRes.map((r) => {
                      const range = getReservationRange(r);
                      const visibleStart = Math.max(periodStartMin, range.startMin);
                      const visibleEnd = Math.min(periodEndMin, range.endMin);
                      const stepHours = activePeriod.id === 'all' ? 2 : 1;
                      const topHours = (visibleStart - periodStartMin) / 60 / stepHours;
                      const durationHours = (visibleEnd - visibleStart) / 60 / stepHours;
                      const top = topHours * UNIT_H;
                      const cardH = Math.max(UNIT_H - CELL_INSET * 2, durationHours * UNIT_H - CELL_INSET * 2);

                      return (
                        <BookingCard
                          key={`${r.table}|${r.guest}|${range.startMin}`}
                          res={r}
                          top={top}
                          height={cardH}
                          animate={recentKey === `${r.table}|${r.guest}|${r.time || r.start}`}
                          onOpen={() => {
                            setProfile(profileFor(r.guest));
                            setSelectedReservation(r);
                          }}
                          onCancel={() => handleCancelBooking(r)}
                        />
                      );
                    })}
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
              disabled={
                !bookingTime ||
                !bookingTable ||
                isTimeBookedForTable(bookingTable, bookingTime, bookingDate, reservationList, duration)
              }
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

            <Field label="Duration">
              <div className="flex gap-2">
                {[1, 1.5, 2, 3].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleSelectDuration(h)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-colors duration-150 ease-soft ${
                      duration === h
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                    }`}>
                    {h} {h === 1 ? 'hour' : 'hours'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={bookingDate}
                onChange={(e) => handleSelectDate(e.target.value)} />
            </Field>

            <Field label="Table / section">
              <div className="flex flex-wrap gap-2">
                {[...bookingTables, ...bookingSections].map((t) => {
                  const isSelected = bookingTable === t;
                  const isBookedAtTime = bookingTime
                    ? isTimeBookedForTable(t, bookingTime, bookingDate, reservationList, duration)
                    : false;

                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectTable(t)}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                        isSelected
                          ? 'border-ink bg-ink text-white'
                          : isBookedAtTime
                          ? 'border-line/60 bg-surface/50 text-meta/60 hover:text-ink'
                          : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                      }`}>
                      {t}
                      {isBookedAtTime && !isSelected && (
                        <span className="ml-1 text-[10px] font-normal text-status-amber">
                          busy
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label={
                <div className="flex items-center justify-between">
                  <span>Time</span>
                  {bookingTable && (
                    <span className="text-[10px] font-normal lowercase tracking-normal text-meta">
                      Strikethrough = Booked for {bookingTable}
                    </span>
                  )}
                </div>
              }>
              {/* Quick Period Filter Chips inside Drawer */}
              <div className="mb-2.5 flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1">
                {[
                  { id: 'all', label: 'All times' },
                  { id: 'morning', label: 'Morning' },
                  { id: 'afternoon', label: 'Afternoon' },
                  { id: 'evening', label: 'Evening' },
                  { id: 'night', label: 'Night' }
                ].map((dp) => (
                  <button
                    key={dp.id}
                    type="button"
                    onClick={() => setDrawerPeriod(dp.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ease-soft ${
                      drawerPeriod === dp.id
                        ? 'bg-ink text-white shadow-xs'
                        : 'text-meta hover:bg-surface hover:text-ink'
                    }`}>
                    {dp.label}
                  </button>
                ))}
              </div>

              <div className="max-h-52 overflow-y-auto scroll-thin flex flex-wrap gap-2 p-0.5">
                {displayedDrawerSlots.map((t) => {
                  const isBooked = isTimeBookedForTable(
                    bookingTable,
                    t,
                    bookingDate,
                    reservationList,
                    duration
                  );
                  const isSelected = bookingTime === t;

                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={isBooked}
                      onClick={() => setBookingTime(t)}
                      title={isBooked ? `${t} is already booked for ${bookingTable}` : undefined}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-soft ${
                        isSelected
                          ? 'border-ink bg-ink text-white'
                          : isBooked
                          ? 'cursor-not-allowed border-line/40 bg-line/20 text-meta/40 line-through'
                          : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                      }`}>
                      {t}
                      {isBooked && (
                        <span className="ml-1 text-[10px] font-normal no-underline opacity-60">
                          booked
                        </span>
                      )}
                    </button>
                  );
                })}
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
        onClose={() => { setProfile(null); setSelectedReservation(null); }}
        title={selectedReservation ? `${profile.name} · ${selectedReservation.table}` : profile.name}
        subtitle={selectedReservation ? `${selectedReservation.time || '17:00'} · ${selectedReservation.covers} covers · ${selectedReservation.status}` : 'Guest profile'}
        footer={
          <div className="flex flex-col gap-2 w-full">
            {selectedReservation && selectedReservation.status !== 'Cancelled' && (
              <Button
                variant="red"
                full
                onClick={() => handleCancelBooking(selectedReservation)}>
                Cancel booking
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setProfile(null); setSelectedReservation(null); }}>
                Close
              </Button>
              <Button
                variant="dark"
                className="flex-1"
                onClick={() => {
                  toast('Booking opened for ' + profile.name, { tone: 'dark' });
                  const tbl = selectedReservation?.table;
                  setProfile(null);
                  setSelectedReservation(null);
                  openNewBooking(tbl);
                }}>
                New booking
              </Button>
            </div>
          </div>
        }>

        {selectedReservation && (
          <DetailSection title="Reservation details">
            <dl className="divide-y divide-line rounded-xl border border-line bg-canvas px-3 py-1">
              <DetailRow label="Table" value={selectedReservation.table} />
              <DetailRow
                label="Time & Date"
                value={`${selectedReservation.time || '17:00'} (${selectedReservation.duration || 1}h) · ${selectedReservation.date || '2026-09-10'}`}
              />
              <DetailRow label="Covers" value={`${selectedReservation.covers} guests`} mono />
              <DetailRow
                label="Status"
                value={
                  <Pill tone={statusTone[selectedReservation.status] || 'blue'} dot>
                    {selectedReservation.status}
                  </Pill>
                }
              />
              {selectedReservation.specialRequests && (
                <DetailRow label="Special requests" value={selectedReservation.specialRequests} />
              )}
            </dl>
          </DetailSection>
        )}

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
