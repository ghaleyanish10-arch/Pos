import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDaysIcon,
  MessageSquareIcon,
  PencilIcon,
  SearchXIcon,
  SendIcon,
  TrashIcon,
  UserPlusIcon,
  UserRoundIcon,
  UserXIcon,
  UsersIcon } from
'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { DetailDrawer, DetailSection } from '../components/ui/DetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, FilterChips, SearchInput, Toggle, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { shifts as shiftsData, staff as staffData, weekDays, laborBudget } from '../data/manage';
import { initials, roleFill, roleTone, shiftCount, weeklyHours } from '../data/staff';
import api from '../api/client';

const stripMinutes = (t) => (t ? String(t).slice(0, 5).replace(/:00$/, '') : '');

const toStaffMember = (item) => ({
  id: item.id,
  name: item.name,
  role: item.role || '',
  email: item.email || '',
  phone: item.phone || '',
  hasPin: !!item.has_pin,
  station: '',
  joined: '',
  active: true
});

const toShift = (s) => ({
  id: s.id,
  staff: s.staff_name,
  role: s.role,
  day: s.day,
  time: `${stripMinutes(s.start_time)}–${stripMinutes(s.end_time)}`,
  staff_id: s.staff_id
});

const seedThread = (person) => [
  { from: 'them', text: `Hey - quick heads up before tomorrow's ${person.role.toLowerCase()} shift.`, time: '18:42' },
  { from: 'me', text: 'Got it, thanks. Noted on the schedule.', time: '18:50' }
];

const changedStaff = [
  { name: 'Riya Sharma', role: 'Waiter', change: '+2h moved to Thu' },
  { name: 'Kiran Lama', role: 'Kitchen', change: 'Added Sat shift' },
  { name: 'Prakash Adhikari', role: 'Bar', change: '-1h removed from Wed' }];

export function Team() {
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const [team, setTeam] = useState(staffData);
  const [schedule, setSchedule] = useState(shiftsData);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weekRange, setWeekRange] = useState('This week');
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [message, setMessage] = useState(null);
  const [threads, setThreads] = useState({});
  const [draft, setDraft] = useState('');
  const [staffDrawer, setStaffDrawer] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const [staffRes, shiftsRes, deactivatedRes] = await Promise.all([
          api('/staff'),
          api('/shifts'),
          api('/staff/deactivated')
        ]);
        if (cancelled) return;
        const members = staffRes?.data || [];
        const deactivated = deactivatedRes?.data || [];
        if (members.length + deactivated.length > 0) {
          setTeam([
            ...members.map(toStaffMember),
            ...deactivated.map((m) => ({ ...toStaffMember(m), active: false }))
          ]);
        }
        const shiftsList = shiftsRes?.data || [];
        if (staffRes && Array.isArray(shiftsList)) setSchedule(shiftsList.map(toShift));
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('ready'); // demo roster keeps the page usable offline
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeStaff = team.filter((p) => p.active !== false);
  const deactivatedStaff = team.filter((p) => p.active === false);

  const rolesPresent = useMemo(
    () => ['All roles', ...[...new Set(team.map((p) => p.role).filter(Boolean))]],
    [team]
  );

  // Filtered roster: search + role + status in one pass.
  const filteredActive = useMemo(() => {
    const q = query.toLowerCase();
    return activeStaff.filter((p) =>
      (!q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) &&
      (roleFilter === 'All roles' || p.role === roleFilter));
  }, [activeStaff, query, roleFilter]);

  const filteredDeactivated = useMemo(() => {
    const q = query.toLowerCase();
    return deactivatedStaff.filter((p) =>
      (!q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) &&
      (roleFilter === 'All roles' || p.role === roleFilter));
  }, [deactivatedStaff, query, roleFilter]);

  const totalScheduled = schedule.reduce((s, sh) => {
    const [a, b] = sh.time.split('–').map(Number);
    const hours = b >= a ? b - a : 24 - a + b;
    return s + hours;
  }, 0);
  const budgetDiff = totalScheduled - laborBudget.hours;

  const openAddStaff = () => {
    setEditingStaff(null);
    setForm({ name: '', role: 'Cashier', email: '', phone: '', station: 'Main floor', pin: '', rate: '' });
    setStaffDrawer(true);
  };

  const openEditStaff = (person) => {
    if (submitting) {
      toast('Still saving — wait a moment before editing', { tone: 'amber' });
      return;
    }
    setEditingStaff(person);
    setForm({ name: person.name, role: person.role, email: person.email, phone: person.phone, station: person.station, pin: '', rate: person.rate ?? '' });
    setStaffDrawer(true);
  };

  const nextStaffId = 'MST-' +
    (Math.max(...team.map((p) => parseInt(String(p.id).split('-')[1], 10) || 0)) + 1);

  const saveStaff = async () => {
    if (!form?.name.trim()) {
      toast('Enter a staff name', { tone: 'red' });
      return;
    }
    const pin = (form.pin || '').trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      toast('PIN must be 4–6 digits', { tone: 'red' });
      return;
    }
    const payload = { name: form.name.trim(), role: form.role, email: form.email?.trim() || '' };
    if (pin) payload.pin = pin;
    const rateNum = Number(form.rate);
    const rate = form.rate !== '' && !Number.isNaN(rateNum) && rateNum >= 0 ? rateNum : null;

    if (editingStaff) {
      const before = editingStaff;
      // Optimistic local update keeps the roster snappy, but we roll it back
      // if the server rejects the change — never leave a phantom edit in place.
      setTeam((prev) =>
        prev.map((p) => (p.id === editingStaff.id ? { ...p, ...form } : p)));
      setDetail((d) => (d && d.id === editingStaff.id ? { ...d, ...form } : d));
      setSubmitting(true);
      try {
        // Both calls run in parallel; allSettled lets us report granularly
        // instead of pretending a rate-only failure was a full save.
        const settled = await Promise.allSettled([
          api(`/staff/${editingStaff.id}`, { method: 'PUT', body: { name: payload.name, role: payload.role } }),
          rate !== null
            ? api(`/staff/${editingStaff.id}/rate`, { method: 'PUT', body: { rate } })
            : Promise.resolve(null)
        ]);
        const [rosterRes, rateRes] = settled;
        const rosterOk = rosterRes.status === 'fulfilled';
        const rateOk = rateRes.status === 'fulfilled';
        if (rosterOk && rateOk) {
          toast(`${form.name} updated`, { tone: 'green' });
        } else if (!rosterOk) {
          setTeam((prev) => prev.map((p) => (p.id === before.id ? before : p)));
          console.error('staff update failed:', rosterRes.reason);
          toast(`Couldn't update ${before.name}: ${rosterRes.reason?.message || 'server error'}`, { tone: 'red' });
        } else {
          console.error('rate update failed:', rateRes.reason);
          toast(`${form.name} updated, but the hourly rate wasn't saved: ${rateRes.reason?.message || 'server error'}`, { tone: 'red' });
        }
      } finally {
        setSubmitting(false);
      }
      setStaffDrawer(false);
      setEditingStaff(null);
      return;
    }

    // New staff: the row is only real once POST /staff returns a backend id.
    // Mark the local entry "pending" so it cannot be edited/deactivated under
    // a client-only fake id; on failure the entry is removed and the drawer
    // stays open with the real error instead of a fake success toast.
    setSubmitting(true);
    const created = { ...form, id: nextStaffId, joined: 'Sep 2026', pending: true };
    setTeam((prev) => [...prev, created]);
    try {
      const res = await api('/staff', { method: 'POST', body: payload });
      if (res?.member?.id) {
        setTeam((prev) => prev.map((p) => (p.id === created.id ? { ...p, id: res.member.id, pending: false } : p)));
      } else {
        setTeam((prev) => prev.map((p) => (p.id === created.id ? { ...p, pending: false } : p)));
      }
      setStaffDrawer(false);
      setEditingStaff(null);
      toast(res?.message || `${form.name} added to the team`, { tone: 'green' });
    } catch (e) {
      setTeam((prev) => prev.filter((p) => p.id !== created.id));
      console.error('staff create failed:', e);
      toast(`Couldn't add ${form.name}: ${e.message || 'server error'}`, { tone: 'red' });
      // drawer stays open so the form is still there to retry
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async (person) => {
    const removedShifts = schedule.filter((s) => s.staff === person.name).length;
    const prevTeam = team;
    const prevSchedule = schedule;
    // Optimistic, but rolled back if the server says no — deactivation is a
    // backend state now, not a local toggle that evaporates on refresh.
    setTeam((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, active: false } : p)));
    setSchedule((prev) => prev.filter((s) => s.staff !== person.name));
    if (message?.id === person.id) setMessage(null);
    if (detail?.id === person.id) setDetail((d) => ({ ...d, active: false }));
    try {
      await api(`/staff/${person.id}/deactivate`, { method: 'PUT' });
      toast(`${person.name} deactivated · ${removedShifts} shift${removedShifts === 1 ? '' : 's'} removed`, { tone: 'red' });
    } catch (e) {
      console.error('deactivate failed:', e);
      setTeam(prevTeam);
      setSchedule(prevSchedule);
      if (detail?.id === person.id) setDetail((d) => ({ ...d, active: true }));
      toast(`Couldn't deactivate ${person.name}: ${e.message || 'server error'}`, { tone: 'red' });
    }
  };

  const reactivate = async (person) => {
    const prevTeam = team;
    setTeam((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, active: true } : p)));
    if (detail?.id === person.id) setDetail((d) => ({ ...d, active: true }));
    try {
      await api(`/staff/${person.id}/reactivate`, { method: 'PUT' });
      toast(`${person.name} reactivated — reassign shifts`, { tone: 'green' });
    } catch (e) {
      console.error('reactivate failed:', e);
      setTeam(prevTeam);
      if (detail?.id === person.id) setDetail((d) => ({ ...d, active: false }));
      toast(`Couldn't reactivate ${person.name}: ${e.message || 'server error'}`, { tone: 'red' });
    }
  };

  const shiftForm = (sel) => ({
    start: sel?.shift?.time.split('–')[0] ?? '10',
    end: sel?.shift?.time.split('–')[1] ?? '18',
    role: sel?.shift?.role ?? 'Waiter'
  });

  const [shiftDraft, setShiftDraft] = useState(shiftForm(selected));

  const openShift = (sel) => {
    setShiftDraft(shiftForm(sel));
    setSelected(sel);
  };

  const saveShift = () => {
    const start = String(shiftDraft.start).trim() || '10';
    const end = String(shiftDraft.end).trim() || '18';
    const role = shiftDraft.role;
    if (Number(end) === Number(start)) {
      toast('End time must differ from start', { tone: 'red' });
      return;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const shiftBody = {
      day: String(selected.day),
      start_time: `${pad(start)}:00`,
      end_time: `${pad(end)}:00`,
      role
    };
    const staffId = team.find((p) => p.name === selected.staff)?.id;
    const time = `${start}–${end}`;
    if (selected?.shift) {
      const updated = { ...selected.shift, time, role };
      const prev = schedule;
      setSchedule((list) => list.map((s) => (s === selected.shift ? updated : s)));
      toast(`Shift updated · ${weekDays[selected.day]} ${time}`, {
        undo: () => setSchedule(prev)
      });
      if (selected.shift.id) {
        api(`/shifts/${selected.shift.id}`, { method: 'PUT', body: shiftBody }).catch(() => {
          setSchedule((list) => list.map((s) => (s === updated ? selected.shift : s)));
          toast(`Couldn't save ${selected.staff}'s ${weekDays[selected.day]} shift — it wasn't persisted`, { tone: 'red' });
        });
      }
    } else {
      const existing = schedule.find(
        (s) => s.staff === selected.staff && s.day === selected.day && s !== selected.shift);
      if (existing) {
        // A shift already exists for this staff member that day — replace it instead of duplicating.
        const created = { ...existing, time, role };
        const prev = schedule;
        setSchedule((list) => list.map((s) => (s === existing ? created : s)));
        toast(`Replaced existing ${weekDays[selected.day]} shift · ${time}`, {
          undo: () => setSchedule(prev)
        });
        if (existing.id) {
          api(`/shifts/${existing.id}`, { method: 'PUT', body: shiftBody }).catch(() => {
            setSchedule((list) => list.map((s) => (s === created ? existing : s)));
            toast(`Couldn't replace ${selected.staff}'s ${weekDays[selected.day]} shift — it wasn't persisted`, { tone: 'red' });
          });
        }
      } else {
        const created = { staff: selected.staff, role, day: selected.day, time };
        setSchedule((list) => [...list, created]);
        toast(`${selected.staff} · ${weekDays[selected.day]} ${time} added`, {
          tone: 'green',
          undo: () => setSchedule((list) => list.filter((s) => s !== created))
        });
        if (staffId) {
          api('/shifts', { method: 'POST', body: { ...shiftBody, staff_id: staffId } })
            .then((res) => {
              if (res?.id) {
                setSchedule((list) =>
                  list.map((s) => (s === created ? { ...s, id: res.id, staff_id: staffId } : s)));
              }
            })
            .catch(() => {
              setSchedule((list) => list.filter((s) => s !== created));
              toast(`Couldn't add ${selected.staff}'s ${weekDays[selected.day]} shift — it wasn't saved`, { tone: 'red' });
            });
        }
      }
    }
    setSelected(null);
  };

  const dropShift = () => {
    if (!selected?.shift) return;
    const removed = selected.shift;
    setSchedule((list) => list.filter((s) => s !== removed));
    toast(`Shift dropped · ${weekDays[selected.day]} ${removed.time}`, {
      tone: 'red',
      undo: () => setSchedule((list) => [...list, removed])
    });
    if (removed.id) {
      api(`/shifts/${removed.id}`, { method: 'DELETE' }).catch(() => {
        setSchedule((list) => (list.some((s) => s === removed) ? list : [...list, removed]));
        toast(`Couldn't drop ${selected.staff}'s ${weekDays[selected.day]} shift — it's still on the schedule`, { tone: 'red' });
      });
    }
    setSelected(null);
  };

  const openMessage = (person) => {
    setMessage(person);
    setThreads((prev) => (prev[person.name] ? prev : { ...prev, [person.name]: seedThread(person) }));
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !message) return;
    setThreads((prev) => ({
      ...prev,
      [message.name]: [...(prev[message.name] || []), { from: 'me', text, time: 'Just now' }]
    }));
    setDraft('');
  };

  // Clicking a staff member opens the full profile page (attendance history,
  // weekly stats, clock-ins). The ⋯ button keeps the quick-actions drawer.
  // A pending (still-creating) member has only a client-side id — don't send
  // the browser to a profile the backend has never heard of.
  const openProfile = (person) => {
    if (person.pending) return;
    navigate(`/team/${person.id}`);
  };

  const openDetail = (person) => {
    setDetail(person);
  };

  const noResults = filteredActive.length === 0 && filteredDeactivated.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Team & Shifts" descriptor={`Week of 7–13 September · ${activeStaff.length} active · ${totalScheduled}h scheduled`}>
        <SearchInput
          className="w-[200px]"
          placeholder="Search staff"
          value={query}
          onChange={setQuery} />
        <Button variant="outline" onClick={() => {
          setWeekRange('This week');
          setNotifyTeam(true);
          setScheduleOpen(true);
        }}>Publish schedule</Button>
        <Button variant="dark" icon={<UserPlusIcon className="h-4 w-4" />} onClick={openAddStaff}>
          Add staff
        </Button>
      </PageHeader>

      {loadState === 'error' &&
      <div className="mb-4 rounded-xl border border-status-amber/30 bg-tint-amber px-4 py-3 text-sm font-semibold text-status-amber">
          Couldn't reach the server — showing the saved roster.
        </div>
      }

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterChips
          ariaLabel="Role filter"
          options={rolesPresent}
          value={roleFilter}
          onChange={setRoleFilter} />
        <div className="ml-auto flex items-center gap-2">
          <Pill tone="green" dot>
            {activeStaff.length} active
          </Pill>
          {deactivatedStaff.length > 0 &&
          <Pill tone="neutral" dot>
              {deactivatedStaff.length} inactive
            </Pill>
          }
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
              <span className="h-10 w-10 animate-pulse rounded-full bg-canvas" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-3/4 animate-pulse rounded bg-canvas" />
                <span className="block h-3 w-1/3 animate-pulse rounded bg-canvas" />
              </span>
            </div>
          ))}
        </div>
      ) : noResults ? (
        <EmptyState
          icon={query ? <SearchXIcon className="h-6 w-6" /> : <UsersIcon className="h-6 w-6" />}
          title={query ? `No staff match "${query}"` : 'No staff here yet'}
          description={query
            ? 'Try a different name or clear the role filter.'
            : 'Add your first staff member to start scheduling shifts.'}
          action={query
            ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setRoleFilter('All roles'); }}>Clear filters</Button>
            : <Button variant="dark" size="sm" icon={<UserPlusIcon className="h-4 w-4" />} onClick={openAddStaff}>Add staff</Button>} />
      ) : (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {filteredActive.map((person) => (
              <div
                key={person.id}
                onClick={() => openProfile(person)}
                className="flex cursor-pointer items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-150 ease-soft hover:border-ink/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink ring-1 ring-line">
                  {initials(person.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                  <Pill tone={roleTone[person.role]} className="mt-1">{person.role}</Pill>
                </div>
                <button
                  type="button"
                  aria-label={`Actions for ${person.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(person);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-meta transition-colors duration-150 ease-soft hover:border-ink/40 hover:text-ink">
                  ⋯
                </button>
              </div>
            ))}
          </section>

          {filteredActive.length > 0 &&
        <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] border-b border-line">
                  <div className="px-4 py-3 text-caption font-semibold text-meta">
                Staff
                  </div>
                  {weekDays.map((d, i) =>
              <div
                key={d}
                className={`px-3 py-3 text-caption font-semibold ${
                i === 3 ? 'text-ink' : 'text-meta'}`}
                >
                    {d} {i === 3 && <span className="ml-1 font-mono">10</span>}
                  </div>
              )}
                </div>

                {filteredActive.map((person) =>
          <div
            key={person.name}
            className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0">
                <div
              onClick={() => openProfile(person)}
              className="flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors duration-150 ease-soft hover:bg-canvas">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-caption font-bold text-ink">
                    {initials(person.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                    <p className="truncate text-caption font-medium text-meta">{person.role}</p>
                  </div>
                  <span
                aria-hidden="true"
                className="shrink-0 text-meta opacity-0 transition-opacity hover:opacity-100">
                    <PencilIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
                {weekDays.map((_, dayIdx) => {
              const shift = schedule.find(
                (s) => s.staff === person.name && s.day === dayIdx
              );
              return (
                <button
                  key={dayIdx}
                  type="button"
                  onClick={() => openShift({ staff: person.name, day: dayIdx, shift })}
                  className="border-l border-line p-1.5 text-left transition-colors duration-150 ease-soft hover:bg-canvas">
                      {shift ?
                  <span
                    className={`block rounded-lg border px-2.5 py-2 ${roleFill[shift.role]}`}>
                          <span className="block font-mono text-13 font-bold">
                            {shift.time}
                          </span>
                          <span className="block text-caption font-semibold">
                            {shift.role}
                          </span>
                        </span> :
                  <span className="block px-2.5 py-2 text-xs text-meta">+</span>
                  }
                    </button>);
            })}
              </div>
          )}
              </div>
            </div>
        }

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {Object.keys(roleTone).map((r) =>
          <Pill key={r} tone={roleTone[r]} dot>
                {r}
              </Pill>
        )}
          </div>

          {filteredDeactivated.length > 0 &&
      <section className="mt-8 rounded-card border border-dashed border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto min-w-0">
                <h2 className="text-sm font-bold text-ink">Deactivated staff</h2>
                <p className="text-xs text-meta">
              Removed from all shifts and scheduling — reactivate to restore the profile.
                </p>
              </div>
              <Pill tone="neutral">{filteredDeactivated.length}</Pill>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {filteredDeactivated.map((person) => (
              <div
                key={person.id}
                onClick={() => openProfile(person)}
                className="flex cursor-pointer items-center gap-3 rounded-card border border-line bg-canvas p-4 opacity-80 transition-colors duration-150 ease-soft hover:border-ink/30">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-meta">
                    {initials(person.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                    <p className="truncate text-caption font-medium text-meta">{person.role}</p>
                    <Pill tone="neutral" className="mt-1">Inactive</Pill>
                  </div>
                  <button
                  type="button"
                  aria-label={`Actions for ${person.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(person);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-meta hover:border-ink/40 hover:text-ink">
                  ⋯
                  </button>
                </div>
            ))}
            </div>
          </section>
      }
        </>
      )}

      {/* Detail drawer — profile + weekly stats + quick actions in one place */}
      <DetailDrawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || ''}
        subtitle={detail ? `${detail.role}${detail.id ? ` · ${detail.id}` : ''}` : ''}
        footer={
          detail ? (
            detail.active === false ? (
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setDetail(null)}>Close</Button>
                <Button variant="green" className="flex-1" onClick={() => reactivate(detail)}>Reactivate</Button>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setDetail(null)}>Close</Button>
                <Button
                  variant="dark"
                  className="flex-1"
                  onClick={() => {
                    openEditStaff(detail);
                    setDetail(null);
                  }}>
                  Edit details
                </Button>
              </div>
            )
          ) : null
        }>

        {detail &&
        <>
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-base font-bold text-ink ring-1 ring-line">
                {initials(detail.name)}
              </span>
              <div className="min-w-0">
                <Pill tone={detail.active === false ? 'neutral' : roleTone[detail.role] || 'blue'} dot>
                  {detail.active === false ? 'Inactive' : 'Active'}
                </Pill>
                <p className="mt-1.5 text-sm font-semibold text-ink">
                  {detail.email || 'No email on file'}
                </p>
                <p className="text-xs text-meta">{detail.phone || detail.station || '—'}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDetail(null);
                navigate(`/team/${detail.id}`);
              }}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
              View full profile &amp; attendance
              <UserRoundIcon className="h-4 w-4 text-meta" aria-hidden="true" />
            </button>

            <DetailSection title="This week">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                  <p className="font-mono text-xl font-extrabold text-ink">{shiftCount(detail.name, schedule)}</p>
                  <p className="text-caption font-semibold text-meta">Shifts</p>
                </div>
                <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                  <p className="font-mono text-xl font-extrabold text-ink">{weeklyHours(detail.name, schedule)}h</p>
                  <p className="text-caption font-semibold text-meta">Hours</p>
                </div>
                <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                  <p className="font-mono text-xl font-extrabold text-ink">{detail.hasPin ? '✓' : '—'}</p>
                  <p className="text-caption font-semibold text-meta">PIN set</p>
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Upcoming shifts">
              {schedule.filter((s) => s.staff === detail.name).length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-canvas px-3 py-4 text-center text-sm text-meta">
                No shifts scheduled — tap a day on the grid to add one.
                </p>
              ) : (
              <div className="overflow-hidden rounded-xl border border-line">
                  {schedule
                .filter((s) => s.staff === detail.name)
                .map((s, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5 last:border-b-0">
                      <span className="text-sm font-semibold text-ink">{weekDays[s.day]}</span>
                      <span className="font-mono text-sm text-meta">{s.time} · {s.role}</span>
                    </div>
                ))}
                </div>
              )}
            </DetailSection>

            {detail.active !== false &&
          <DetailSection title="Quick actions">
              <div className="grid grid-cols-2 gap-2">
                <Button
                variant="outline"
                icon={<CalendarDaysIcon className="h-4 w-4" />}
                onClick={() => {
                  setDetail(null);
                  openShift({ staff: detail.name, day: 3, shift: null });
                }}>
                Adjust schedule
                </Button>
                <Button
                variant="outline"
                icon={<MessageSquareIcon className="h-4 w-4" />}
                onClick={() => {
                  setDetail(null);
                  openMessage(detail);
                }}>
                Message
                </Button>
              </div>
            </DetailSection>
          }

            <DetailSection title="Danger zone">
              {detail.active === false ? (
              <Button variant="green" full onClick={() => reactivate(detail)}>
                Reactivate {detail.name.split(' ')[0]}
                </Button>
            ) : (
              <Button
                variant="red"
                full
                icon={<UserXIcon className="h-4 w-4" />}
                onClick={() => {
                  deactivate(detail);
                  setDetail(null);
                }}>
                Deactivate {detail.name.split(' ')[0]}
                </Button>
            )}
            </DetailSection>
          </>
        }
      </DetailDrawer>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.shift ? 'Edit shift' : 'Add shift'}
        subtitle={
        selected ? `${selected.staff} · ${weekDays[selected.day]} 10 September` : ''
        }
        footer={
        selected?.shift ?
        <>
              <Button variant="outline" icon={<TrashIcon className="h-4 w-4" />} onClick={dropShift}>
                Drop shift
              </Button>
              <Button variant="dark" full onClick={saveShift}>
                Save changes
              </Button>
            </> :
        <>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button variant="green" full onClick={saveShift}>
                Add shift
              </Button>
            </>
        }>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input
                className={inputClass}
                inputMode="numeric"
                value={shiftDraft.start}
                onChange={(e) => setShiftDraft({ ...shiftDraft, start: e.target.value })} />
            </Field>
            <Field label="End">
              <input
                className={inputClass}
                inputMode="numeric"
                value={shiftDraft.end}
                onChange={(e) => setShiftDraft({ ...shiftDraft, end: e.target.value })} />
            </Field>
          </div>
          <Field label="Role">
            <select
              className={inputClass}
              value={shiftDraft.role}
              onChange={(e) => setShiftDraft({ ...shiftDraft, role: e.target.value })}>
              <option>Kitchen</option>
              <option>Waiter</option>
              <option>Bar</option>
              <option>Host</option>
            </select>
          </Field>
          {selected?.shift &&
          <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-sm font-semibold text-ink">Swap request</p>
              <p className="mt-0.5 text-xs text-meta">
                Offer this shift to the rest of the team — first to accept takes it.
              </p>
              <Button size="sm" variant="outline" className="mt-3">
                Offer swap
              </Button>
            </div>
          }
        </div>
      </Drawer>

      <Drawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Publish schedule"
        subtitle={`Week of 7–13 September`}
        footer={
        <>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="green"
              full
              onClick={() => {
                toast(`Schedule published · ${notifyTeam ? staffData.length + ' staff notified' : 'no notifications'}`, { tone: 'green' });
                setScheduleOpen(false);
              }}>
              Confirm publish
            </Button>
          </>
        }>
        <div className="space-y-5">
            <div>
              <p className="mb-3 text-caption font-semibold text-meta">
                Week range
              </p>
              <FilterChips
                ariaLabel="Week range"
                options={['This week', 'Next week']}
                value={weekRange}
                onChange={setWeekRange} />
            </div>

            <div>
              <p className="mb-3 text-caption font-semibold text-meta">
                Staff with changes since last publish
              </p>
              <div className="space-y-1.5">
                {changedStaff.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-micro font-bold text-ink">
                        {s.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{s.name}</p>
                        <p className="text-xs text-meta">{s.role}</p>
                      </div>
                    </div>
                    <span className="text-xs text-meta">{s.change}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-caption font-semibold text-meta">
                  Scheduled hours
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                  {totalScheduled}h
                </p>
              </div>
              <div className={`rounded-xl border p-4 ${
                budgetDiff > 0
                  ? 'border-status-red/30 bg-tint-red/40'
                  : 'border-status-green/30 bg-tint-green/40'}`}>
                <p className="text-caption font-semibold text-meta">
                  Labor budget
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                  {laborBudget.hours}h
                </p>
                <p className={`mt-0.5 font-mono text-xs font-bold ${
                  budgetDiff > 0 ? 'text-status-red' : 'text-status-green'}`}>
                  {budgetDiff > 0 ? '+' : ''}{budgetDiff}h · {laborBudget.cost}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Notify team</p>
                <p className="text-xs text-meta">Send push notification to all staff</p>
              </div>
              <Toggle checked={notifyTeam} onChange={setNotifyTeam} label="Notify team" />
            </div>
          </div>
      </Drawer>

      <Drawer
        open={!!message}
        onClose={() => setMessage(null)}
        title={`Message · ${message ? message.name : ''}`}
        subtitle={message ? `${message.role} · ${message.id}` : ''}
        footer={
          <Button variant="outline" full onClick={() => setMessage(null)}>
            Close
          </Button>
        }>
        <div className="flex h-[380px] flex-col">
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto pr-1">
            {(threads[message?.name] || []).map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.from === 'me' ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm border border-line bg-canvas text-ink'}`}>
                  <p>{m.text}</p>
                  <p className={`mt-1 text-micro ${m.from === 'me' ? 'text-white/50' : 'text-meta'}`}>{m.time}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end gap-2 border-t border-line pt-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={`Message ${message ? message.name.split(' ')[0] : ''}…`}
              className={inputClass} />
            <button
              type="button"
              aria-label="Send message"
              onClick={sendMessage}
              disabled={!draft.trim()}
              className="btn btn-primary btn-icon-only shrink-0">
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={staffDrawer && !!form}
        onClose={() => { setStaffDrawer(false); setEditingStaff(null); }}
        title={editingStaff ? 'Edit staff' : 'Add staff'}
        subtitle={editingStaff ? `${editingStaff.id} · currently active` : `Next ID ${nextStaffId}`}
        footer={
        <>
            <Button variant="outline" onClick={() => { setStaffDrawer(false); setEditingStaff(null); }} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="dark" full onClick={saveStaff} disabled={submitting}>
              {submitting ? (editingStaff ? 'Saving…' : 'Adding…') : (editingStaff ? 'Save changes' : 'Add staff')}
            </Button>
          </>
        }>
        {form &&
        <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-canvas text-base font-bold text-ink ring-1 ring-line">
                {form.name ? initials(form.name) : '?'}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {form.name || 'New staff member'}
                </p>
                <p className="mt-1 text-xs text-meta">
                  {editingStaff ? `Editing ${editingStaff.id}` : `Will be assigned ${nextStaffId}`}
                </p>
              </div>
            </div>

            <Field label="Full name">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Anjal Shrestha" />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {!['Cashier', 'Store Manager', 'Inventory Auditor', 'Corporate Admin'].includes(form.role) &&
                  <option>{form.role}</option>}
                <option>Cashier</option>
                <option>Store Manager</option>
                <option>Inventory Auditor</option>
                <option>Corporate Admin</option>
              </select>
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@mesa.os" />
            </Field>
            {!editingStaff &&
            <div>
              <Field label="Clock-in PIN (4–6 digits)">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  placeholder="e.g. 8316" />
              </Field>
              <p className="mt-1.5 text-xs text-meta">
                Optional — setting one lets {form.name || 'this person'} clock in at a terminal with this PIN.
              </p>
            </div>
            }
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="9800000000" />
            </Field>
            <Field label="Station">
              <input
                className={inputClass}
                value={form.station}
                onChange={(e) => setForm({ ...form, station: e.target.value })}
                placeholder="Main floor" />
            </Field>
            <Field label="Hourly rate (Rs / hour)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.rate ?? ''}
                onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="e.g. 250" />
            </Field>

            {editingStaff &&
          <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-sm font-semibold text-ink">Danger zone</p>
              <p className="mt-0.5 text-xs text-meta">
                Deactivating removes {editingStaff.name} from all shifts, attendance and scheduling.
              </p>
              <Button
                size="sm"
                variant="red"
                className="mt-3"
                onClick={() => { deactivate(editingStaff); setStaffDrawer(false); setEditingStaff(null); }}>
                Deactivate {editingStaff.name.split(' ')[0]}
              </Button>
            </div>
          }
          </div>
        }
      </Drawer>
    </div>);

}
