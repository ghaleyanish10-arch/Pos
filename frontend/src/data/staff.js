export const roleTone = {
  Cashier: 'blue',
  'Store Manager': 'purple',
  'Inventory Auditor': 'amber',
  'Corporate Admin': 'green'
};

export const roleFill = {
  Cashier: 'bg-tint-blue text-status-blue border-status-blue/25',
  'Store Manager': 'bg-tint-purple text-status-purple border-status-purple/25',
  'Inventory Auditor': 'bg-tint-amber text-status-amber border-status-amber/25',
  'Corporate Admin': 'bg-tint-green text-status-green border-status-green/25'
};

export const shiftCount = (name, list) => list.filter((s) => s.staff === name).length;
export const initials = (name) => name.split(' ').map((n) => n[0]).join('');

export const weeklyHours = (name, list) => {
  const total = list
    .filter((s) => s.staff === name)
    .reduce((sum, sh) => sum + shiftHours(sh), 0);
  return `${total}h`;
};

export const shiftHours = (sh) => {
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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const heatLevel = [
  'bg-line/50',
  'bg-tint-blue/60',
  'bg-tint-blue',
  'bg-status-blue/60',
  'bg-status-blue'
];

export const heatLabel = ['Absent', 'Short day', 'Standard', 'Long', 'Overtime'];

export const statusTone = [
  'bg-canvas text-meta',
  'bg-tint-blue/60 text-status-blue',
  'bg-tint-blue text-status-blue',
  'bg-status-blue/15 text-status-blue',
  'bg-status-blue text-white'
];

export const toHm = (total) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export const fmtDate = (d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

export function attendanceDays(personName, shiftList) {
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