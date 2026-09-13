import { useState } from 'react';
import { MONTHS, heatLevel, statusTone, fmtDate } from '../../data/staff';

export function AttendanceHeatmap({ cols, person }) {
  const [tip, setTip] = useState(null);

  const cell = tip ? cols[tip.ci]?.[tip.di] : null;

  return (
    <div className="flex-1">
      <div
        className="flex flex-col gap-2"
        onMouseLeave={() => setTip(null)}>
        <div className="flex gap-1">
          {cols.map((col, ci) => {
            const label = ci === 0 || MONTHS[col[3]?.monthIndex] !== MONTHS[cols[ci - 1][3]?.monthIndex]
              ? MONTHS[col[3]?.monthIndex]
              : '';
            const monthGap = ci > 0 && col[0]?.monthIndex !== cols[ci - 1][0]?.monthIndex;
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
          {cols.map((col, ci) => {
            const monthGap = ci > 0 && col[0]?.monthIndex !== cols[ci - 1][0]?.monthIndex;
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

      {cell && (
        <div
          className="pointer-events-none fixed z-50 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface p-4 shadow-pop"
          style={{ left: tip.x + 1, top: tip.y - 14 }}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">{fmtDate(cell.date)}</p>
                {person && (
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {person.name}
                    <span className="ml-1.5 font-mono text-[11px] font-medium text-meta">{person.role}</span>
                  </p>
                )}
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
      )}
    </div>
  );
}