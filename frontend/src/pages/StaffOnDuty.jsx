import { useMemo, useState } from 'react';
import { PhoneIcon, UsersIcon } from 'lucide-react';
import { staff } from '../data/manage';
import { useToast } from '../components/ui/Toast';

const ROLE_DOT = {
  Waiter: 'bg-status-blue',
  Kitchen: 'bg-status-amber',
  Bar: 'bg-status-purple',
  Host: 'bg-status-green'
};

const initialsOf = (name) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const onShiftNow = (person, index) => index % 2 === 0;

export function StaffOnDuty() {
  const [filter, setFilter] = useState('All');
  const toast = useToast();

  const roles = useMemo(() => ['All', ...new Set(staff.map((s) => s.role))], []);
  const rows = useMemo(
    () => staff.filter((s) => filter === 'All' || s.role === filter),
    [filter]
  );
  const onShift = staff.filter((_, i) => onShiftNow(null, i)).length;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Staff on duty</h1>
        <p className="mt-1 text-sm text-meta">
          {onShift} on shift now · roster from today&apos;s rota
        </p>
      </header>

      {/* role scroller */}
      <nav aria-label="Filter staff by role" className="scroll-thin -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {roles.map((r) => {
          const count = r === 'All' ? staff.length : staff.filter((s) => s.role === r).length;
          const active = filter === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(r)}
              className={`chip flex shrink-0 items-center gap-1.5 ${
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'
              }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[r] || 'bg-meta'}`} aria-hidden="true" />
              {r}
              <span className={`font-mono text-xs ${active ? 'text-white/70' : 'text-meta'}`}>{count}</span>
            </button>
          );
        })}
      </nav>

      {/* the roster — big touch rows, action-first */}
      <div className="flex flex-col gap-2.5">
        {rows.map((p, i) => {
          const onNow = onShiftNow(p, i);
          return (
            <article
              key={p.id}
              className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${
                onNow ? 'bg-ink text-white' : 'bg-canvas text-meta'
              }`}>
                {initialsOf(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                <p className="mt-0.5 truncate text-xs text-meta">
                  {p.role} · {p.station || p.id}
                </p>
                {!onNow && <p className="text-micro text-meta/70">Off shift</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label={`Call ${p.name}`}
                  onClick={() => toast(`Calling ${p.name}…`, { tone: 'dark' })}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors duration-150 ease-soft active:bg-canvas">
                  <PhoneIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toast(`${p.name} — full profile & rota live on the desk screen`, { tone: 'dark' })}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-13 font-bold text-ink transition-colors duration-150 ease-soft active:bg-canvas">
                  <UsersIcon className="h-4 w-4" />
                  Rota
                </button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-shelf border border-dashed border-line bg-surface px-6 py-14 text-center">
            <UsersIcon className="h-8 w-8 text-meta/50" />
            <p className="text-sm font-semibold text-ink">No one in that role</p>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-meta">
        Rota, attendance and payroll live on the desk screen under Staff.
      </p>
    </div>
  );
}