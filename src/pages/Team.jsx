import { useState } from 'react';
import {
  CalendarDaysIcon,
  EyeIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareIcon,
  PencilIcon,
  PhoneIcon,
  SendIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Drawer } from '../components/ui/Drawer';
import { Field, FilterChips, Toggle, inputClass } from '../components/ui/Controls';
import { ActionMenu } from '../components/ui/ActionMenu';
import { HoverCard, HoverCardContent } from '../components/ui/HoverCard';
import { useToast } from '../components/ui/Toast';
import { shifts, staff, weekDays, laborBudget } from '../data/manage';

const roleTone = {
  Kitchen: 'amber',
  Service: 'blue',
  Bar: 'purple',
  Host: 'green'
};

const roleFill = {
  Kitchen: 'bg-tint-amber text-status-amber border-status-amber/25',
  Service: 'bg-tint-blue text-status-blue border-status-blue/25',
  Bar: 'bg-tint-purple text-status-purple border-status-purple/25',
  Host: 'bg-tint-green text-status-green border-status-green/25'
};

const shiftCount = (name, list) => list.filter((s) => s.staff === name).length;
const initials = (name) => name.split(' ').map((n) => n[0]).join('');

const seedThread = (person) => [
  { from: 'them', text: `Hey - quick heads up before tomorrow's ${person.role.toLowerCase()} shift.`, time: '18:42' },
  { from: 'me', text: 'Got it, thanks. Noted on the schedule.', time: '18:50' }
];
const weeklyHours = (name, list) => {
  const total = list
    .filter((s) => s.staff === name)
    .reduce((sum, sh) => {
      const [a, b] = sh.time.split('–').map(Number);
      return sum + (b >= a ? b - a : 24 - a + b);
    }, 0);
  return `${total}h`;
};

const shiftHours = (sh) => {
  if (!sh) return 0;
  const [a, b] = sh.time.split('–').map(Number);
  return b >= a ? b - a : 24 - a + b;
};

function hashSeed(seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h / 0xffffffff;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const heatLevel = [
  'bg-line/50',
  'bg-tint-blue/60',
  'bg-tint-blue',
  'bg-status-blue/60',
  'bg-status-blue'
];

const heatLabel = ['Absent', 'Short day', 'Standard', 'Long', 'Overtime'];

const statusTone = [
  'bg-canvas text-meta',
  'bg-tint-blue/60 text-status-blue',
  'bg-tint-blue text-status-blue',
  'bg-status-blue/15 text-status-blue',
  'bg-status-blue text-white'
];

const toHm = (total) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

const fmtDate = (d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

function attendanceDays(personName, shiftList) {
  const today = new Date();
  const columns = [];
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const firstMonday = new Date(yearStart);
  firstMonday.setDate(yearStart.getDate() - ((yearStart.getDay() + 6) % 7));
  const cursor = new Date(firstMonday);
  while (cursor <= today) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (d > today) break;
      const weekday = (d.getDay() + 6) % 7;
      const shift = shiftList.find((s) => s.staff === personName && s.day === weekday);
      const seed = (d.getFullYear() * 1000000 + (d.getMonth() + 1) * 10000 + d.getDate()) ^
        personName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 7919;
      const r = hashSeed(seed);
      let level = 0;
      if (shift) {
        level = r < 0.16 ? 0 : shiftHours(shift) >= 9 ? 4 : shiftHours(shift) >= 7 ? 3 : shiftHours(shift) >= 5 ? 2 : 1;
      } else if (r > 0.94) {
        level = 1;
      }
      const hours = level === 1 ? 5 : level === 2 ? 6 : level === 3 ? 8 : level === 4 ? 10 : 0;
      const start = level === 4 ? 9 : level === 1 ? 11 : 10;
      const mins = r < 0.5 ? 0 : r < 0.75 ? 10 : 30;
      col.push({
        date: d,
        weekday,
        level,
        monthIndex: d.getMonth(),
        present: level > 0,
        hours,
        clockIn: level > 0 ? toHm(start * 60 + mins) : null,
        clockOut: level > 0 ? toHm(start * 60 + hours * 60 + mins) : null,
        scheduled: shift ? `${shift.time} · ${shift.role}` : null,
        status: level === 0 ? (shift ? 'Leave' : 'Day off') : heatLabel[level]
      });
    }
    columns.push(col);
    cursor.setDate(cursor.getDate() + 7);
  }
  return columns;
}

const changedStaff = [
{ name: 'Riya Sharma', role: 'Service', change: '+2h moved to Thu' },
{ name: 'Kiran Lama', role: 'Kitchen', change: 'Added Sat shift' },
{ name: 'Prakash Adhikari', role: 'Bar', change: '-1h removed from Wed' }];

export function Team() {
  const [selected, setSelected] = useState(null);
  const toast = useToast();

  const [team, setTeam] = useState(staff);
  const [schedule, setSchedule] = useState(shifts);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weekRange, setWeekRange] = useState('This week');
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [attendanceStaff, setAttendanceStaff] = useState(staff[0].name);
  const [tip, setTip] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState(null);
  const [threads, setThreads] = useState({});
  const [draft, setDraft] = useState('');
  const [staffDrawer, setStaffDrawer] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [form, setForm] = useState(null);

  const activeStaff = team.filter((p) => p.active !== false);
  const deactivatedStaff = team.filter((p) => p.active === false);

  const totalScheduled = schedule.reduce((s, sh) => {
    const [a, b] = sh.time.split('–').map(Number);
    const hours = b >= a ? b - a : 24 - a + b;
    return s + hours;
  }, 0);
  const budgetDiff = totalScheduled - laborBudget.hours;

  const attCols = attendanceDays(attendanceStaff, schedule);

  const openAddStaff = () => {
    setEditingStaff(null);
    setForm({ name: '', role: 'Service', email: '', phone: '', station: 'Main floor' });
    setStaffDrawer(true);
  };

  const openEditStaff = (person) => {
    setEditingStaff(person);
    setForm({ name: person.name, role: person.role, email: person.email, phone: person.phone, station: person.station });
    setStaffDrawer(true);
  };

  const nextStaffId = 'MST-' +
    (Math.max(...team.map((p) => parseInt(p.id.split('-')[1], 10) || 0)) + 1);

  const saveStaff = () => {
    if (!form?.name.trim()) {
      toast('Enter a staff name', { tone: 'red' });
      return;
    }
    if (editingStaff) {
      setTeam((prev) =>
        prev.map((p) => (p.name === editingStaff.name ? { ...p, ...form } : p)));
      toast(`${form.name} updated`, { tone: 'green' });
    } else {
      setTeam((prev) => [...prev, { ...form, id: nextStaffId, joined: 'Sep 2026' }]);
      toast(`${form.name} added to the team`, { tone: 'green' });
    }
    setStaffDrawer(false);
    setEditingStaff(null);
  };

  const deactivate = (person) => {
    const removedShifts = schedule.filter((s) => s.staff === person.name).length;
    setTeam((prev) =>
      prev.map((p) => (p.name === person.name ? { ...p, active: false } : p)));
    setSchedule((prev) => prev.filter((s) => s.staff !== person.name));
    if (profile?.name === person.name) setProfile(null);
    if (message?.name === person.name) setMessage(null);
    toast(`${person.name} deactivated · ${removedShifts} shift${removedShifts === 1 ? '' : 's'} removed`, { tone: 'red' });
  };

  const reactivate = (person) => {
    setTeam((prev) =>
      prev.map((p) => (p.name === person.name ? { ...p, active: true } : p)));
    toast(`${person.name} reactivated — reassign shifts`, { tone: 'green' });
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

  const actionsFor = (person) => {
    if (person.active === false) {
      return [
        { label: 'Reactivate', icon: <UserCheckIcon className="h-4 w-4" />, onClick: () => reactivate(person) },
        { label: 'Edit details', icon: <PencilIcon className="h-4 w-4" />, onClick: () => openEditStaff(person) }
      ];
    }
    return [
      { label: 'View profile', icon: <EyeIcon className="h-4 w-4" />, onClick: () => setProfile(person) },
      { label: 'Message', icon: <MessageSquareIcon className="h-4 w-4" />, onClick: () => openMessage(person) },
      { label: 'Adjust schedule', icon: <CalendarDaysIcon className="h-4 w-4" />, onClick: () => setSelected({ staff: person.name, day: 3, shift: null }) },
      { label: 'Edit details', icon: <PencilIcon className="h-4 w-4" />, onClick: () => openEditStaff(person) },
      { divider: true },
      { label: 'Deactivate', icon: <UserXIcon className="h-4 w-4" />, danger: true, onClick: () => deactivate(person) }
    ];
  };

  const profileShifts = profile ? schedule.filter((s) => s.staff === profile.name) : [];
  const profileHours = profile
    ? profileShifts.reduce((s, sh) => s + shiftHours(sh), 0)
    : 0;
  const profilePresent = profile ? attendanceDays(profile.name, schedule).flat().filter((d) => d.present).length : 0;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Team & Shifts" descriptor="Week of 7–13 September">
        <Pill tone="green" dot>
          9 on shift now
        </Pill>
        <Pill tone="amber" dot>
          3 open shifts
        </Pill>
        <Button variant="outline" onClick={() => {
          setWeekRange('This week');
          setNotifyTeam(true);
          setScheduleOpen(true);
        }}>Publish schedule</Button>
        <Button variant="dark" icon={<UserPlusIcon className="h-4 w-4" />} onClick={openAddStaff}>
          Add staff
        </Button>
      </PageHeader>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {activeStaff.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
            
            <HoverCard
              content={
              <HoverCardContent
                name={person.name}
                role={person.role}
                subtitle={`Staff ID ${person.id} · Payroll group A`}
                status="active"
                stats={[
                { label: 'Shifts', value: shiftCount(person.name, schedule) },
                { label: 'Hours', value: weeklyHours(person.name, schedule) }]
                } />
              }>
              
              <span className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink ring-1 ring-line">
                {person.name.split(' ').map((n) => n[0]).join('')}
              </span>
            </HoverCard>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
              <p className="truncate font-mono text-xs text-meta">{person.id}</p>
              <Pill tone={roleTone[person.role]} className="mt-1">{person.role}</Pill>
            </div>

            <ActionMenu
              label={`Actions for ${person.name}`}
              actions={actionsFor(person)}
              />
          </div>
        ))}
      </section>

      <div className="scroll-thin overflow-x-auto rounded-card border border-line bg-surface">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] border-b border-line">
            <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Staff
            </div>
            {weekDays.map((d, i) =>
            <div
              key={d}
              className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${
              i === 3 ? 'text-ink' : 'text-meta'}`
              }>
              
                {d} {i === 3 && <span className="ml-1 font-mono">10</span>}
              </div>
            )}
          </div>

          {activeStaff.map((person) =>
          <div
            key={person.name}
            className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0">
            
              <div className="flex items-center gap-2 px-4 py-3">
                <HoverCard
                  content={
                  <HoverCardContent
                    name={person.name}
                    role={person.role}
                    subtitle={`Staff ID ${person.id}`}
                    status="active"
                    stats={[
                    { label: 'Shifts', value: shiftCount(person.name, schedule) },
                    { label: 'Hours', value: weeklyHours(person.name, schedule) }]
                    } />
                  }>
                  
                  <span className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-canvas text-[11px] font-bold text-ink">
                    {person.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                </HoverCard>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                  <p className="font-mono text-[11px] text-meta">{person.id}</p>
                </div>
                <ActionMenu
                  size="sm"
                  label={`Actions for ${person.name}`}
                  actions={actionsFor(person)}
                  />
              </div>
              {weekDays.map((_, dayIdx) => {
              const shift = schedule.find(
                (s) => s.staff === person.name && s.day === dayIdx
              );
              return (
                <button
                  key={dayIdx}
                  type="button"
                  onClick={() => setSelected({ staff: person.name, day: dayIdx, shift })}
                  className="border-l border-line p-1.5 text-left transition-colors duration-150 ease-soft hover:bg-canvas">
                  
                    {shift ?
                  <span
                    className={`block rounded-lg border px-2.5 py-2 ${roleFill[shift.role]}`}>
                    
                        <span className="block font-mono text-[13px] font-bold">
                          {shift.time}
                        </span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em]">
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {Object.keys(roleTone).map((r) =>
        <Pill key={r} tone={roleTone[r]} dot>
            {r}
          </Pill>
        )}
      </div>

      {deactivatedStaff.length > 0 &&
      <section className="mt-8 rounded-card border border-dashed border-line bg-surface p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0">
              <h2 className="text-sm font-bold text-ink">Deactivated staff</h2>
              <p className="text-xs text-meta">
                Removed from all shifts and scheduling — reactivate to restore the profile.
              </p>
            </div>
            <Pill tone="neutral">{deactivatedStaff.length}</Pill>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {deactivatedStaff.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-3 rounded-card border border-line bg-canvas p-4 opacity-80">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-meta">
                  {initials(person.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                  <p className="truncate font-mono text-xs text-meta">{person.id}</p>
                  <Pill tone="neutral" className="mt-1">Inactive</Pill>
                </div>
                <ActionMenu
                  label={`Actions for ${person.name}`}
                  actions={actionsFor(person)}
                  />
              </div>
            ))}
          </div>
        </section>
      }

      <section className="mt-8 rounded-card border border-line bg-surface p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <h2 className="text-sm font-bold text-ink">Attendance</h2>
            <p className="text-xs text-meta">Clock-in history · last year</p>
          </div>
          <FilterChips
            ariaLabel="Staff attendance"
            options={activeStaff.map((s) => s.name)}
            value={attendanceStaff}
            onChange={setAttendanceStaff} />
        </div>

        <div
          className="flex flex-col gap-2"
          onMouseLeave={() => setTip(null)}>
          <div className="flex gap-1">
            {attCols.map((col, ci) => {
              const label = ci === 0 || MONTHS[col[3]?.monthIndex] !== MONTHS[attCols[ci - 1][3]?.monthIndex]
                ? MONTHS[col[3]?.monthIndex]
                : '';
              const monthGap = ci > 0 && col[0]?.monthIndex !== attCols[ci - 1][0]?.monthIndex;
              return (
                <div
                  key={ci}
                  className={`basis-0 flex-1 text-center text-[9px] font-semibold uppercase leading-none tracking-wide text-meta ${monthGap ? 'ml-1' : ''}`}>
                  {label}
                </div>
              );
            })}
          </div>

          <div className="flex gap-1">
            {attCols.map((col, ci) => {
              const monthGap = ci > 0 && col[0]?.monthIndex !== attCols[ci - 1][0]?.monthIndex;
              return (
                <div key={ci} className={`flex basis-0 flex-1 flex-col gap-1 ${monthGap ? 'ml-1' : ''}`}>
                  {col.map((d, di) => (
                    <div
                      key={`${ci}-${di}`}
                      onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, ci, di })}
                      className={`aspect-square w-full cursor-default rounded-[3px] ${heatLevel[d.level]} transition-transform duration-150 ease-soft hover:scale-125 hover:ring-2 hover:ring-status-blue/40`} />
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-1 flex items-center gap-1 text-[11px] text-meta">
            <span>Less</span>
            {heatLevel.slice(1).map((c) => <span key={c} className={`h-[10px] w-[10px] rounded-[3px] ${c}`} />)}
            <span>More</span>
            <span className="ml-3">Scheduled shift days over the window, with leave &amp; extras derived from clock-in records.</span>
          </div>
        </div>
      </section>

      {tip && (() => {
        const cell = attCols[tip.ci]?.[tip.di];
        if (!cell) return null;
        const person = activeStaff.find((s) => s.name === attendanceStaff);
        return (
          <div
            className="pointer-events-none fixed z-50 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface p-4 shadow-pop"
            style={{ left: tip.x + 1, top: tip.y - 14 }}>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">{fmtDate(cell.date)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {person?.name}
                    <span className="ml-1.5 font-mono text-[11px] font-medium text-meta">{person?.role}</span>
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone[cell.level]}`}>
                  {cell.status}
                </span>
              </div>

              {cell.present ? (
                <div className="rounded-lg border border-line bg-canvas px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-meta">Clock in</span>
                    <span className="font-mono font-bold text-ink">{cell.clockIn}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-meta">Clock out</span>
                    <span className="font-mono font-bold text-ink">{cell.clockOut}</span>
                  </div>
                  <div className="mt-2 border-t border-dashed border-line pt-2 text-[11px] text-meta">
                    {cell.hours}h on shift{cell.scheduled && <span> · scheduled {cell.scheduled}</span>}
                  </div>
                </div>
              ) : cell.scheduled ? (
                <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] text-meta">
                  Leave taken · {cell.scheduled} not worked
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] text-meta">
                  No shift scheduled today
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
              <Button variant="outline" onClick={() => setSelected(null)}>
                Drop shift
              </Button>
              <Button variant="dark" full onClick={() => setSelected(null)}>
                Save changes
              </Button>
            </> :

        <>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button variant="green" full onClick={() => setSelected(null)}>
                Add shift
              </Button>
            </>

        }>
        
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input className={inputClass} defaultValue={selected?.shift?.time.split('–')[0] ?? '10'} />
            </Field>
            <Field label="End">
              <input className={inputClass} defaultValue={selected?.shift?.time.split('–')[1] ?? '18'} />
            </Field>
          </div>
          <Field label="Role">
            <select className={inputClass} defaultValue={selected?.shift?.role ?? 'Service'}>
              <option>Kitchen</option>
              <option>Service</option>
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
                toast(`Schedule published · ${notifyTeam ? staff.length + ' staff notified' : 'no notifications'}`, { tone: 'green' });
                setScheduleOpen(false);
              }}>
              Confirm publish
            </Button>
          </>
        }>
        
        <div className="space-y-5">
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Week range
              </p>
              <FilterChips
                ariaLabel="Week range"
                options={['This week', 'Next week']}
                value={weekRange}
                onChange={setWeekRange} />
            </div>

            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Staff with changes since last publish
              </p>
              <div className="space-y-1.5">
                {changedStaff.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                    
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-ink">
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
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
        open={!!profile}
        onClose={() => setProfile(null)}
        title={profile ? profile.name : ''}
        subtitle={profile ? `${profile.role} · ${profile.id}` : ''}>
        {profile && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-canvas text-base font-bold text-ink ring-1 ring-line">
                {initials(profile.name)}
              </span>
              <div>
                <Pill tone={roleTone[profile.role]} dot>{profile.role}</Pill>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-meta">
                  <span className="h-2 w-2 rounded-full bg-status-green" />
                  Active · joined {profile.joined}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <div className="flex items-center gap-3 py-1">
                <MailIcon className="h-4 w-4 text-meta" />
                <span className="font-mono text-sm text-ink">{profile.email}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 py-1">
                <PhoneIcon className="h-4 w-4 text-meta" />
                <span className="font-mono text-sm text-ink">{profile.phone}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 py-1">
                <MapPinIcon className="h-4 w-4 text-meta" />
                <span className="text-sm text-ink">{profile.station} · Payroll group A</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                <p className="font-mono text-xl font-extrabold text-ink">{profileShifts.length}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-meta">Shifts wk</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                <p className="font-mono text-xl font-extrabold text-ink">{profileHours}h</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-meta">Hours wk</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3 text-center">
                <p className="font-mono text-xl font-extrabold text-ink">{profilePresent}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-meta">Days yr</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">This week</p>
              {profileShifts.length > 0 ? (
                <ul className="space-y-1.5">
                  {profileShifts.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
                      <span className="font-semibold text-ink">{weekDays[s.day]}</span>
                      <span className="font-mono text-xs text-meta">{s.time} · {s.role}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-meta">No shifts scheduled this week.</p>
              )}
            </div>

            <Button variant="dark" full icon={<MessageSquareIcon className="h-4 w-4" />} onClick={() => openMessage(profile)}>
              Message {profile.name.split(' ')[0]}
            </Button>
          </div>
        )}
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
                  <p className={`mt-1 text-[10px] ${m.from === 'me' ? 'text-white/50' : 'text-meta'}`}>{m.time}</p>
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-opacity duration-150 ease-soft hover:opacity-90 disabled:opacity-40">
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
            <Button variant="outline" onClick={() => { setStaffDrawer(false); setEditingStaff(null); }}>
              Cancel
            </Button>
            <Button variant="dark" full onClick={saveStaff}>
              {editingStaff ? 'Save changes' : 'Add staff'}
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
                <option>Service</option>
                <option>Kitchen</option>
                <option>Bar</option>
                <option>Host</option>
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
