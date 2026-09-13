import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDaysIcon,
  EyeIcon,
  MessageSquareIcon,
  PencilIcon,
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
import { AttendanceHeatmap } from '../components/ui/AttendanceHeatmap';
import { shifts, staff, weekDays, laborBudget } from '../data/manage';
import { attendanceDays, initials, roleFill, roleTone, shiftCount, weeklyHours } from '../data/staff';

const seedThread = (person) => [
  { from: 'them', text: `Hey - quick heads up before tomorrow's ${person.role.toLowerCase()} shift.`, time: '18:42' },
  { from: 'me', text: 'Got it, thanks. Noted on the schedule.', time: '18:50' }
];

const changedStaff = [
{ name: 'Riya Sharma', role: 'Service', change: '+2h moved to Thu' },
{ name: 'Kiran Lama', role: 'Kitchen', change: 'Added Sat shift' },
{ name: 'Prakash Adhikari', role: 'Bar', change: '-1h removed from Wed' }];

export function Team() {
  const [selected, setSelected] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const [team, setTeam] = useState(staff);
  const [schedule, setSchedule] = useState(shifts);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weekRange, setWeekRange] = useState('This week');
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [attendanceStaff, setAttendanceStaff] = useState(staff[0].name);
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
      { label: 'View profile', icon: <EyeIcon className="h-4 w-4" />, onClick: () => navigate(`/team/${person.id}`) },
      { label: 'Message', icon: <MessageSquareIcon className="h-4 w-4" />, onClick: () => openMessage(person) },
      { label: 'Adjust schedule', icon: <CalendarDaysIcon className="h-4 w-4" />, onClick: () => setSelected({ staff: person.name, day: 3, shift: null }) },
      { label: 'Edit details', icon: <PencilIcon className="h-4 w-4" />, onClick: () => openEditStaff(person) },
      { divider: true },
      { label: 'Deactivate', icon: <UserXIcon className="h-4 w-4" />, danger: true, onClick: () => deactivate(person) }
    ];
  };

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

        <AttendanceHeatmap
          cols={attCols}
          person={activeStaff.find((s) => s.name === attendanceStaff)}
          key={attendanceStaff} />
      </section>

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
