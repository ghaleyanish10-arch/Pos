import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CalendarDaysIcon, MailIcon, MapPinIcon, PhoneIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { AttendanceHeatmap } from '../components/ui/AttendanceHeatmap';
import { staff as staticStaff, shifts as staticShifts, weekDays } from '../data/manage';
import { attendanceDays, initials, roleTone, shiftHours, statusTone } from '../data/staff';
import api from '../api/client';

const stripMinutes = (t) => (t ? String(t).slice(0, 5).replace(/:00$/, '') : '');

const toProfileShift = (s) => ({
  staff: s.staff_name,
  day: s.day,
  time: `${stripMinutes(s.start_time)}–${stripMinutes(s.end_time)}`,
  role: s.role
});

export function StaffProfile() {
  const { id } = useParams();
  const [members, setMembers] = useState(staticStaff);
  const [shifts, setShifts] = useState(staticShifts);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staffRes, shiftsRes] = await Promise.all([
          api('/staff'),
          api('/shifts')
        ]);
        if (cancelled) return;
        const data = staffRes?.data || [];
        if (data.length > 0) {
          setMembers(data.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role || '',
            email: '',
            phone: '',
            station: '',
            joined: ''
          })));
        }
        if (staffRes) setShifts((shiftsRes?.data || []).map(toProfileShift));
      } catch {
        /* keep static demo data as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const person = members.find((p) => p.id === id) || staticStaff.find((p) => p.id === id);

  if (!person) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <Link
          to="/team"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to team
        </Link>
        <div className="mt-6 rounded-card border border-line bg-surface p-10 text-center">
          <p className="text-sm font-bold text-ink">Staff profile not found</p>
          <p className="mt-1 text-xs text-meta">No staff member with ID {id}.</p>
        </div>
      </div>
    );
  }

  const attCols = attendanceDays(person.name, shifts);
  const flatDays = attCols.flat();
  const presentDays = flatDays.filter((d) => d.present);
  const recent = [...presentDays].reverse().slice(0, 12);
  const personShifts = shifts.filter((s) => s.staff === person.name);
  const hoursWeek = personShifts.reduce((s, sh) => s + shiftHours(sh), 0);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <Link
        to="/team"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to team
      </Link>

      <PageHeader title={person.name} descriptor={person.role}>
        <Pill tone={roleTone[person.role]} dot>
          {person.role}
        </Pill>
        <Pill tone="green" dot>
          Active
        </Pill>
      </PageHeader>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-canvas text-lg font-bold text-ink ring-1 ring-line">
              {initials(person.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-ink">{person.name}</p>
              <p className="text-xs text-meta">
                {person.email || person.phone
                  ? `${[person.email, person.phone].filter(Boolean).join(' · ')}`
                  : person.role}
              </p>
              {person.joined && <p className="mt-0.5 text-xs text-meta">Joined {person.joined}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-card border border-line bg-surface p-4 text-center">
              <p className="font-mono text-2xl font-extrabold text-ink">{personShifts.length}</p>
              <p className="mt-1 text-caption font-semiboldst text-meta">Shifts / week</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 text-center">
              <p className="font-mono text-2xl font-extrabold text-ink">{hoursWeek}h</p>
              <p className="mt-1 text-caption font-semiboldst text-meta">Hours / week</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 text-center">
              <p className="font-mono text-2xl font-extrabold text-ink">{presentDays.length}</p>
              <p className="mt-1 text-caption font-semiboldst text-meta">Days present · yr</p>
            </div>
          </div>

          <section className="rounded-card border border-line bg-surface p-5">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-ink">Attendance</h2>
              <p className="text-xs text-meta">Clock-in history · last year</p>
            </div>
            <AttendanceHeatmap cols={attCols} person={person} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">Contact</h2>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <MailIcon className="h-4 w-4 shrink-0 text-meta" />
                <span className="min-w-0 truncate font-mono text-sm text-ink">{person.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <PhoneIcon className="h-4 w-4 shrink-0 text-meta" />
                <span className="font-mono text-sm text-ink">{person.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPinIcon className="h-4 w-4 shrink-0 text-meta" />
                <span className="text-sm text-ink">{person.station}</span>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-meta">
                <CalendarDaysIcon className="h-3.5 w-3.5" />
                This week
              </p>
              {personShifts.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {personShifts.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
                      <span className="font-semibold text-ink">{weekDays[s.day]}</span>
                      <span className="font-mono text-xs text-meta">{s.time} · {s.role}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-meta">
                  No shifts scheduled this week.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">Recent clock-ins</h2>
            <div className="mt-3 space-y-1.5">
              {recent.map((d) => (
                <div
                  key={d.date.toISOString()}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {d.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="font-mono text-caption text-meta">
                      {d.clockIn}–{d.clockOut} · {d.hours}h
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-caption font-semibold ${statusTone[d.level]}`}>
                    {d.status}
                  </span>
                </div>
              ))}
              {recent.length === 0 && (
                <p className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-meta">
                  No clock-ins recorded yet.
                </p>
              )}
            </div>
          </section>

          <Link
            to="/team"
            className="flex h-10 w-full items-center justify-center rounded-xl border border-line bg-white text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/40 hover:bg-canvas">
            Back to team roster
          </Link>
        </div>
      </section>
    </div>
  );
}