import { useEffect, useMemo, useState } from 'react';
import { CalendarXIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill, StatusDot } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { DetailDrawer, DetailRow, DetailSection } from '../components/ui/DetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Field, SearchInput, Tabs, Toggle, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import {
  guests,
  guestTimeline,
  bookingSections,
  waitlist as waitlistData } from
'../data/manage';
import { useTables } from '../state/TableContext';
import api from '../api/client';

const statusTone = {
  confirmed: 'blue',
  seated: 'green',
  completed: 'green',
  no_show: 'red',
  cancelled: 'gray'
};

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Cancelled'
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

function BookingCard({ res, top, height: cardHeight, animate, onOpen, onQuickAction, onCancel }) {
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

  const displayTime = res.time || '';

  return (
    <article
      onClick={onOpen}
      className="group absolute left-0 w-full cursor-pointer overflow-hidden rounded-xl border border-line bg-canvas p-3 transition-[height,border-color] duration-300 ease-soft hover:border-ink/30 z-10"
      style={{ top, height }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-tight text-ink truncate">
          {res.guest_name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {onQuickAction && res.status === 'confirmed' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAction();
              }}
              title="Seat the party"
              className="flex h-5 items-center justify-center rounded-md border border-status-green/30 bg-status-green/10 px-1.5 text-micro font-bold text-status-green transition-colors duration-150 ease-soft hover:bg-status-green hover:text-white lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
              Seat
            </button>
          )}
          {onCancel && res.status === 'confirmed' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              title="Cancel booking"
              className="flex h-5 items-center justify-center rounded-md border border-status-red/30 bg-status-red/10 px-1.5 text-micro font-bold text-status-red transition-colors duration-150 ease-soft hover:bg-status-red hover:text-white lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
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
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded-md bg-tint-blue px-1.5 py-0.5 text-micro font-semibold capitalize text-status-blue">
            {getTimePeriod(res.time)}
          </span>
          <p className="truncate text-caption font-semibold text-meta">
            {STATUS_LABELS[res.status] || res.status}
          </p>
        </div>
        <span className="text-micro text-meta">Details →</span>
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

// Local demo reservations seed the grid when the API has none yet. Keys on
// the table's internal name (T2, T5…) so edits to display names or seat
// counts never orphan an existing booking.
export const defaultReservations = [
  { guest_name: 'Bikash Rai', covers: 2, table: 'T2', time: '09:00', duration: 1, status: 'confirmed' },
  { guest_name: 'Breakfast Club', covers: 4, table: 'T5', time: '10:00', duration: 1.5, status: 'confirmed' },
  { guest_name: 'Elina Gurung', covers: 4, table: 'T5', time: '12:30', duration: 1.5, status: 'confirmed' },
  { guest_name: 'Thamel Tech Lunch', covers: 6, table: 'T12', time: '13:00', duration: 2, status: 'confirmed' },
  { guest_name: 'Deepak Thapa', covers: 4, table: 'T5', time: '17:00', duration: 2, status: 'seated' },
  { guest_name: 'Anisha Shrestha', covers: 2, table: 'T2', time: '18:00', duration: 1, status: 'confirmed' },
  { guest_name: 'Corporate — Yeti Air', covers: 8, table: 'T11', time: '18:00', duration: 3, status: 'confirmed' },
  { guest_name: 'Gurung family', covers: 6, table: 'T12', time: '19:00', duration: 2, status: 'confirmed' },
  { guest_name: 'Walk-in hold', covers: 2, table: 'T2', time: '20:00', duration: 1, status: 'no_show' },
  { guest_name: 'Chloe Martin', covers: 2, table: 'T5', time: '21:00', duration: 1, status: 'confirmed' },
  { guest_name: 'Late Night Lounge', covers: 6, table: 'T11', time: '22:00', duration: 2, status: 'confirmed' }
];

const RESERVATIONS_KEY = 'mesa_reservations_v3';

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
  return null;
}

function isTimeBookedForTable(table, timeStr, date, reservations, proposedDuration = 1) {
  if (!table || !timeStr) return false;
  let slotStart = timeToMinutes(timeStr);
  if (slotStart === null) return false;
  if (timeStr === '00:00' || timeStr === '00:30') slotStart += 24 * 60;
  const slotEnd = slotStart + proposedDuration * 60;

  return reservations.some((r) => {
    if (r.status === 'cancelled' || r.status === 'Cancelled') return false;
    if (r.table !== table) return false;
    const rDate = r.date || '2026-09-10';
    if (date && rDate !== date) return false;
    const range = getReservationRange(r);
    if (!range) return false;
    return slotStart < range.endMin && slotEnd > range.startMin;
  });
}

export const DURATION_OPTIONS = [1, 1.5, 2, 3];

// How long a table stays genuinely free from `timeStr` for a new booking on
// `date`: the gap to the next overlapping reservation on that table, capped at
// closing (midnight; late-evening slots may run past it). Durations longer
// than this gap must be disabled so bookings can never overlap.
function availableMinutesFor(table, timeStr, date, reservations) {
  if (!table || !timeStr) return null; // unknown — don't constrain
  let start = timeToMinutes(timeStr);
  if (start === null) return null;
  if (timeStr === '00:00' || timeStr === '00:30') start += 24 * 60;

  let nextStart = Infinity;
  for (const r of reservations) {
    if (r.status === 'cancelled' || r.status === 'Cancelled') continue;
    if (r.table !== table) continue;
    if (date && (r.date || '2026-09-10') !== date) continue;
    const range = getReservationRange(r);
    if (!range) continue;
    if (range.startMin > start && range.startMin < nextStart) nextStart = range.startMin;
  }

  return nextStart === Infinity ? 24 * 60 - start : nextStart - start;
}

function readStoredReservations() {
  try {
    const raw = localStorage.getItem(RESERVATIONS_KEY);
    if (!raw) return defaultReservations;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const existingKeys = new Set(parsed.map((r) => `${r.table}|${r.time || r.start}`));
      const missingDefaults = defaultReservations.filter(
        (d) => !existingKeys.has(`${d.table}|${d.time}`)
      );
      return [...parsed, ...missingDefaults];
    }
    return defaultReservations;
  } catch {
    return defaultReservations;
  }
}

// Normalize an API reservation row or a local one into one shape for the grid.
function normalizeReservation(r) {
  const status = String(r.status || 'confirmed').toLowerCase();
  let time = r.time;
  if (!time && r.start_time) {
    const d = new Date(r.start_time);
    time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (!time) time = '17:00';
  return {
    id: r.id || '',
    guest_name: r.guest_name || r.guest || 'Guest',
    covers: r.covers || 2,
    table: r.table || (typeof r.table_id === 'string' ? r.table_id : '') || 'T2',
    date: r.date || (r.start_time ? String(r.start_time).slice(0, 10) : '2026-09-10'),
    time,
    duration: r.duration || 1,
    status,
    specialRequests: r.special_requests || r.specialRequests || undefined,
    depositRequired: r.deposit_required || r.depositRequired || false
  };
}

export function Bookings() {
  const toast = useToast();
  const { tables: floorTables, rooms: liveRooms } = useTables();

  const bookableTables = useMemo(() => floorTables.map((t) => t.name), [floorTables]);
  const tableRoom = useMemo(
    () => Object.fromEntries(floorTables.map((t) => [t.name, t.room])),
    [floorTables]
  );
  const seatLabel = useMemo(
    () => Object.fromEntries(floorTables.map((t) => [t.name, `${t.name} · ${t.seats}p`])),
    [floorTables]
  );

  const [reservationList, setReservationList] = useState(readStoredReservations);
  const [waitlistState, setWaitlistState] = useState(waitlistData);
  const [selectedPeriod, setSelectedPeriod] = useState('evening');
  const [drawerPeriod, setDrawerPeriod] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error

  const [bookingOpen, setBookingOpen] = useState(false);
  const [guestQuery, setGuestQuery] = useState('');
  const [addInline, setAddInline] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [duration, setDuration] = useState(1);
  const [bookingDate, setBookingDate] = useState('2026-09-10');
  const [bookingTime, setBookingTime] = useState(null);
  const [bookingTable, setBookingTable] = useState(bookableTables[0]);
  const [specialRequests, setSpecialRequests] = useState('');
  const [depositRequired, setDepositRequired] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [recentKey, setRecentKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const [resRes, wlRes] = await Promise.all([
          api('/reservations'),
          api('/waitlist')
        ]);
        if (cancelled) return;
        const apiRows = (resRes?.data || []).map(normalizeReservation);
        if (apiRows.length > 0) {
          // Merge: local seeds fill gaps, API rows win on the same slot.
          const apiKeys = new Set(apiRows.map((r) => `${r.table}|${r.time}`));
          const locals = readStoredReservations().filter((r) => !apiKeys.has(`${r.table}|${r.time}`));
          setReservationList([...apiRows, ...locals]);
        }
        if (wlRes?.data && wlRes.data.length > 0) {
          setWaitlistState(wlRes.data.map((w) => ({
            id: w.id,
            name: w.guest_name || w.name || 'Party',
            party: w.covers || 2,
            waited: w.waited || '—',
            quoted: w.quoted || '—'
          })));
        }
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('ready'); // demo data keeps the grid usable offline
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const statusCounts = useMemo(() => {
    const counts = { All: reservationList.length, Confirmed: 0, Seated: 0, 'No-show': 0, Cancelled: 0 };
    reservationList.forEach((r) => {
      const label = STATUS_LABELS[r.status];
      if (label && counts[label] !== undefined) counts[label] += 1;
    });
    return counts;
  }, [reservationList]);

  const filteredReservations = useMemo(() => {
    let rows = reservationList;
    if (statusFilter !== 'All') {
      rows = rows.filter((r) => STATUS_LABELS[r.status] === statusFilter);
    }
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => r.guest_name.toLowerCase().includes(q) || r.table.toLowerCase().includes(q));
    }
    return rows;
  }, [reservationList, statusFilter, query]);

  const periodCovers = DAY_PERIODS.reduce((acc, period) => {
    const pStart = period.startHour * 60;
    const pEnd = period.endHour * 60;
    const covers = filteredReservations
      .filter((r) => {
        if (r.status === 'cancelled') return false;
        const range = getReservationRange(r);
        if (!range) return false;
        return range.startMin < pEnd && range.endMin > pStart;
      })
      .reduce((sum, r) => sum + (r.covers || 0), 0);
    acc[period.id] = covers;
    return acc;
  }, [filteredReservations]);

  const displayedDrawerSlots = drawerPeriod === 'all'
    ? ALL_BOOKING_TIME_SLOTS
    : ALL_BOOKING_TIME_SLOTS.filter((t) => getTimePeriod(t) === drawerPeriod);

  const roomChips = liveRooms
    .map((room) => ({ room, count: bookableTables.filter((tbl) => tableRoom[tbl] === room).length }))
    .filter((g) => g.count > 0);
  const displayTables = roomFilter === 'all'
    ? bookableTables
    : bookableTables.filter((tbl) => tableRoom[tbl] === roomFilter);

  function openNewBooking(table = null, time = null) {
    const selectedTbl = table || bookableTables[0];
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

  // Real availability for the current table+time: durate options longer than
  // the free gap are disabled, and the selected duration auto-clamps down.
  const freeMinutes = bookingTime
    ? availableMinutesFor(bookingTable, bookingTime, bookingDate, reservationList)
    : null;
  const longestFit = freeMinutes == null
    ? null
    : DURATION_OPTIONS.filter((h) => h * 60 <= freeMinutes).pop() || null;

  // Keep the state valid whenever the gap shrinks (table/date/time change).
  useEffect(() => {
    if (longestFit == null || duration <= longestFit) return;
    setDuration(longestFit);
  }, [longestFit]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextBookingStart = bookingTime
    ? (() => {
        const start = timeToMinutes(bookingTime) + (bookingTime === '00:00' || bookingTime === '00:30' ? 24 * 60 : 0);
        let next = Infinity;
        for (const r of reservationList) {
          if (r.status === 'cancelled' || r.status === 'Cancelled' || r.table !== bookingTable) continue;
          if (bookingDate && (r.date || '2026-09-10') !== bookingDate) continue;
          const range = getReservationRange(r);
          if (range && range.startMin > start && range.startMin < next) next = range.startMin;
        }
        return next === Infinity ? null : next;
      })()
    : null;
  const durationHint = freeMinutes == null
    ? null
    : freeMinutes >= 24 * 60 - timeToMinutes(bookingTime)
      ? 'The table is free for the rest of the day.'
      : `Only ${Math.floor(freeMinutes / 60)} hour${Math.floor(freeMinutes / 60) === 1 ? '' : 's'} is available before ${String(Math.floor(nextBookingStart / 60) % 24).padStart(2, '0')}:${String(nextBookingStart % 60).padStart(2, '0')}.`;

  const guestSearchResults = guestQuery.length > 0
  ? guests.filter((g) => g.name.toLowerCase().includes(guestQuery.toLowerCase()))
  : [];

  async function handleCreateBooking() {
    const name = addInline ? guestName.trim() : (guestSearchResults[0]?.name || 'Guest');
    const selectedTable = bookingTable || bookableTables[0];

    if (!bookingTime) {
      toast('Please select an available booking time', { tone: 'red' });
      return;
    }

    if (isTimeBookedForTable(selectedTable, bookingTime, bookingDate, reservationList, duration)) {
      toast('That time is already booked for ' + selectedTable, { tone: 'red' });
      return;
    }

    let newRes = normalizeReservation({
      guest_name: name,
      covers: partySize,
      table: selectedTable,
      date: bookingDate,
      time: bookingTime,
      duration,
      status: 'confirmed',
      special_requests: specialRequests || undefined,
      deposit_required: depositRequired || false
    });

    // Persist the reservation server-side (the API requires start_time + covers
    // and takes duration as whole hours and an optional table/guest link). The
    // created row's id is kept so seat/cancel below hit the real row; if the
    // server is unreachable the booking stays optimistic in the local grid.
    const tableRow = floorTables.find((t) => t.name === selectedTable);
    try {
      const created = await api('/reservations', {
        method: 'POST',
        body: {
          guest_id: addInline ? '' : (guestSearchResults[0]?.id || ''),
          guest_name: newRes.guest_name,
          covers: newRes.covers,
          table_id: tableRow?.id || '',
          start_time: `${newRes.date}T${newRes.time}:00Z`,
          duration: Math.max(1, Math.round(newRes.duration))
        }
      });
      if (created?.id) {
        newRes = {
          ...newRes,
          id: created.id,
          start_time: created.start_time || newRes.start_time,
          table_id: created.table_id || tableRow?.id || '',
          duration: created.duration || newRes.duration
        };
      }
    } catch {
      /* server unreachable — keep the optimistic local booking */
    }

    setReservationList((p) => [...p, newRes]);
    setRecentKey(`${newRes.table}|${newRes.time}`);
    toast('Booking confirmed · ' + name, { tone: 'green' });
    setBookingOpen(false);
  }

  function patchReservation(target, patch) {
    setReservationList((prev) =>
      prev.map((r) => {
        const isMatch =
          r.table === target.table &&
          (r.time === target.time || r.start === target.start) &&
          r.guest_name === target.guest_name &&
          (r.date || '2026-09-10') === (target.date || '2026-09-10');
        if (isMatch) {
          return { ...r, ...patch };
        }
        return r;
      })
    );
    if (target.id) {
      api(`/reservations/${target.id}`, { method: 'PUT', body: patch }).catch(() => {});
    }
  }

  function handleCancelBooking(targetRes) {
    if (!targetRes) return;
    patchReservation(targetRes, { status: 'cancelled' });
    toast(`Booking cancelled · ${targetRes.guest_name} (${targetRes.table})`, { tone: 'dark' });
    setProfile(null);
    setSelectedReservation(null);
  }

  function handleSeatBooking(targetRes) {
    if (!targetRes) return;
    patchReservation(targetRes, { status: 'seated' });
    // Attach the actual floor table so the room/table assignment is persisted.
    const tableRow = floorTables.find((t) => t.name === targetRes.table);
    if (targetRes.id && tableRow?.id) {
      api(`/reservations/${targetRes.id}/seat`, { method: 'PUT', body: { table_id: tableRow.id } }).catch(() => {});
    }
    toast(`${targetRes.guest_name} seated at ${targetRes.table}`, { tone: 'green' });
    setProfile(null);
    setSelectedReservation(null);
  }

  function handleNotifyWaitlist(name) {
    const entry = waitlistState.find((w) => w.name === name);
    if (entry?.id) {
      api(`/waitlist/${entry.id}/notify`, { method: 'PUT' }).catch(() => {});
    }
    setWaitlistState((p) => p.filter((w) => w.name !== name));
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
        <SearchInput
          className="w-[200px]"
          placeholder="Search guest or table"
          value={query}
          onChange={setQuery} />
        <Button variant="dark" onClick={() => openNewBooking()}>New booking</Button>
      </PageHeader>

      {loadState === 'error' &&
      <AlertBanner className="mb-4" tone="amber">
          Couldn't reach the server — showing the locally saved schedule. Changes will sync when you're back online.
        </AlertBanner>
      }

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          options={['All', 'Confirmed', 'Seated', 'No-show', 'Cancelled']}
          value={statusFilter}
          onChange={setStatusFilter}
          counts={statusCounts}
          danger={statusCounts['No-show'] > 0 ? 'No-show' : undefined} />
        <Tabs
          options={DAY_PERIODS.map((p) => p.label)}
          value={activePeriod.label}
          onChange={(label) => setSelectedPeriod(DAY_PERIODS.find((p) => p.label === label)?.id || 'all')}
          counts={DAY_PERIODS.reduce((acc, p) => {
            acc[p.label] = reservationList.filter((r) => {
              if (r.status === 'cancelled') return false;
              if (p.id === 'all') return true;
              return getTimePeriod(r.time) === p.id;
            }).length;
            return acc;
          }, {})}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={roomFilter === 'all'}
            onClick={() => setRoomFilter('all')}
            className={`chip ${
              roomFilter === 'all' ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
            }`}>
            All rooms
          </button>
          {roomChips.map(({ room, count }) => (
            <button
              key={room}
              type="button"
              aria-pressed={roomFilter === room}
              onClick={() => setRoomFilter(roomFilter === room ? 'all' : room)}
              className={`chip flex items-center gap-1.5 ${
                roomFilter === room ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
              }`}>
              {room}
              <span className={`font-mono text-micro ${roomFilter === room ? 'text-white/70' : 'text-meta/70'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface p-4">
        {loadState === 'loading' ? (
          <div className="flex h-[420px] items-center justify-center">
            <EmptyState loading title="Loading bookings" description="Fetching today's reservation sheet…" />
          </div>
        ) : displayTables.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-6 w-6" />}
            title="No tables in this room"
            description="Add tables from the floor plan in Front of House to start taking bookings here."
            action={<Button variant="outline" size="sm" onClick={() => setRoomFilter('all')}>Show all rooms</Button>} />
        ) : (
          <div style={{ minWidth: Math.max(760, displayTables.length * 118) }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-caption font-semibold text-meta">
                {roomFilter === 'all' ? `All rooms · ${displayTables.length} tables` : `${roomFilter} · ${displayTables.length} tables`}
                {statusFilter !== 'All' && ` · ${statusFilter} only`}
              </span>
              <span className="text-caption text-meta">Tap a free slot to book that table</span>
            </div>
            <div className="flex">
              <div className="w-[72px] shrink-0">
                <div className="pb-2 text-caption font-semibold text-meta">
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

              {displayTables.map((table) => {
                const tableRes = filteredReservations.filter((r) => {
                  if (r.table !== table || r.status === 'cancelled') return false;
                  const range = getReservationRange(r);
                  if (!range) return false;
                  return range.startMin < periodEndMin && range.endMin > periodStartMin;
                });

                return (
                  <div key={table} className="min-w-0 flex-1 px-2">
                    <div className="pb-2 text-caption font-semibold text-meta">
                      {seatLabel[table] || table}
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
                            key={`${r.table}|${r.guest_name}|${range.startMin}`}
                            res={r}
                            top={top}
                            height={cardH}
                            animate={recentKey === `${r.table}|${r.time}`}
                            onOpen={() => {
                              setProfile(profileFor(r.guest_name));
                              setSelectedReservation(r);
                            }}
                            onQuickAction={() => handleSeatBooking(r)}
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
        )}
      </div>

      {statusFilter !== 'All' && filteredReservations.length === 0 && loadState === 'ready' &&
      <div className="mt-4">
          <EmptyState
          compact
          tone="neutral"
          icon={<CalendarXIcon className="h-6 w-6" />}
          title={`No ${statusFilter.toLowerCase()} bookings`}
          description="Try a different status filter or clear the search."
          action={
            <Button variant="outline" size="sm" onClick={() => { setStatusFilter('All'); setQuery(''); }}>
              Reset filters
            </Button>
          } />
        </div>
      }

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-ink">
            Waitlist
          </h2>
          <span className="text-caption font-medium text-meta">
            {waitlistState.length} parties · avg quote 22 min
          </span>
        </div>
        {waitlistState.length === 0 ? (
          <EmptyState
          compact
          tone="green"
          title="Waitlist is clear"
          description="No parties waiting — every guest is seated." />
        ) : (
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
          {waitlistState.map((w) =>
          <article
            key={w.name}
            onClick={() => setProfile(profileFor(w.name))}
            className="min-w-[230px] shrink-0 cursor-pointer rounded-card border border-line bg-surface p-4 transition-colors duration-150 ease-soft hover:border-ink/30">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-15 font-bold text-ink">{w.name}</h3>
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
        )}
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
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-micro font-bold text-ink">
                          {g.initials}
                        </span>
                        <span className="font-semibold text-ink">{g.name}</span>
                      </button>
                    ))}
                  </div>
                }
                {guestQuery.length > 0 && guestSearchResults.length === 0 &&
              <p className="mt-1.5 rounded-xl border border-dashed border-line bg-canvas px-3 py-2 text-xs text-meta">
                  No match — flip on “Add new guest” to create {guestQuery}.
                </p>
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
                {DURATION_OPTIONS.map((h) => {
                  const fits = freeMinutes == null || h * 60 <= freeMinutes;
                  return (
                    <button
                    key={h}
                    type="button"
                    disabled={!fits}
                    onClick={() => handleSelectDuration(h)}
                    title={fits ? undefined : `Only ${Math.floor((freeMinutes || 0) / 60)}h available at this time`}
                    className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-colors duration-150 ease-soft ${
                      duration === h
                        ? 'border-ink bg-ink text-white'
                        : !fits
                        ? 'cursor-not-allowed border-line/40 bg-line/10 text-meta/40 line-through'
                        : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                    }`}>
                    {h} {h === 1 ? 'hour' : 'hours'}
                    </button>
                  );
                })}
              </div>
              {durationHint &&
              <p className="mt-2 rounded-lg border border-status-amber/25 bg-tint-amber/40 px-3 py-2 text-xs font-semibold text-status-amber">
                {durationHint}
              </p>
              }
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
                {[...bookableTables, ...bookingSections].map((t) => {
                  const chipLabel = bookingSections.includes(t) ? t : seatLabel[t] || t;
                  const isSelected = bookingTable === t;
                  const isBookedAtTime = bookingTime
                    ? isTimeBookedForTable(t, bookingTime, bookingDate, reservationList, duration)
                    : false;

                  return (
                    <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectTable(t)}
                    className={`rounded-full border px-3 py-1.5 text-13 font-semibold transition-colors duration-150 ease-soft ${
                      isSelected
                        ? 'border-ink bg-ink text-white'
                        : isBookedAtTime
                        ? 'border-line/60 bg-surface/50 text-meta/60 hover:text-ink'
                        : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                    }`}>
                    {chipLabel}
                      {isBookedAtTime && !isSelected && (
                        <span className="ml-1 text-micro font-normal text-status-amber">
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
                    <span className="text-micro font-normal lowercase tracking-normal text-meta">
                      Strikethrough = Booked for {bookingTable}
                    </span>
                  )}
                </div>
              }>
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
                    className={`rounded-full border px-3 py-1.5 text-13 font-semibold transition-colors duration-150 ease-soft ${
                      isSelected
                        ? 'border-ink bg-ink text-white'
                        : isBooked
                        ? 'cursor-not-allowed border-line/40 bg-line/20 text-meta/40 line-through'
                        : 'border-line bg-surface text-meta hover:border-ink/30 hover:text-ink'
                    }`}>
                    {t}
                      {isBooked && (
                        <span className="ml-1 text-micro font-normal no-underline opacity-60">
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
        subtitle={selectedReservation ? `${selectedReservation.time || '17:00'} · ${selectedReservation.covers} covers · ${STATUS_LABELS[selectedReservation.status] || selectedReservation.status}` : 'Guest profile'}
        footer={
          <div className="flex flex-col gap-2 w-full">
            {selectedReservation && selectedReservation.status === 'confirmed' && (
              <div className="flex gap-2">
                <Button variant="green" className="flex-1" onClick={() => handleSeatBooking(selectedReservation)}>
                  Seat party
                </Button>
                <Button variant="red" className="flex-1" onClick={() => handleCancelBooking(selectedReservation)}>
                  Cancel
                </Button>
              </div>
            )}
            {selectedReservation && selectedReservation.status !== 'confirmed' && (
              <Button
                variant="red"
                full
                disabled={selectedReservation.status === 'cancelled'}
                onClick={() => handleCancelBooking(selectedReservation)}>
                {selectedReservation.status === 'cancelled' ? 'Already cancelled' : 'Cancel booking'}
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
              <DetailRow
                label="Service"
                value={
                  <span className="rounded-md bg-tint-blue px-1.5 py-0.5 text-xs font-semibold capitalize text-status-blue">
                    {getTimePeriod(selectedReservation.time)}
                  </span>
                }
              />
              <DetailRow label="Covers" value={`${selectedReservation.covers} guests`} mono />
              <DetailRow
                label="Status"
                value={
                  <Pill tone={statusTone[selectedReservation.status] || 'blue'} dot>
                    {STATUS_LABELS[selectedReservation.status] || selectedReservation.status}
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
