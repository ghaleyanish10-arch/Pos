// KDS design tokens. Every KDS component reads status presentation from here
// so the four states can never drift apart (badge, dot, timer, accent line).
// Colors come from the app's global semantic palette (tailwind.config.js):
// blue = new, amber = cooking, green = ready, red = late/attention.

export const TICKET_STATUS = {
  new: {
    label: 'New',
    dot: 'bg-status-blue',
    text: 'text-status-blue',
    bg: 'bg-tint-blue',
    border: 'border-tintBorder-blue',
    accent: 'bg-status-blue'
  },
  preparing: {
    label: 'Cooking',
    dot: 'bg-status-amber',
    text: 'text-status-amber',
    bg: 'bg-tint-amber',
    border: 'border-tintBorder-amber',
    accent: 'bg-status-amber'
  },
  ready: {
    label: 'Ready',
    dot: 'bg-status-green',
    text: 'text-status-green',
    bg: 'bg-tint-green',
    border: 'border-tintBorder-green',
    accent: 'bg-status-green'
  }
};

export const LATE = {
  label: 'Late',
  dot: 'bg-status-red',
  text: 'text-status-red',
  bg: 'bg-tint-red',
  border: 'border-tintBorder-red',
  accent: 'bg-status-red'
};

// SLA progress thresholds. Past 60% of the SLA the timer turns amber; at 100%
// it turns red and the card gains the "Over X min" treatment.
export const SLA_WARN_RATIO = 0.6;

export const statusOf = (t) => TICKET_STATUS[String(t?.status || 'new').toLowerCase()] || TICKET_STATUS.new;

// Parse "2× Chicken Chilli" strings or {qty,name,notes} objects into lines.
export const parseLine = (it) => {
  if (typeof it === 'string') {
    const m = /^(\d+)\s*[x×]?\s*(.*)$/i.exec(it.trim());
    return m && m[1]
      ? { qty: parseInt(m[1], 10), name: m[2], note: '' }
      : { qty: 1, name: it.trim(), note: '' };
  }
  return { qty: Number(it.qty) || 1, name: String(it.name || ''), note: it.notes || '' };
};

// "TBL 7" / "Takeaway" / "Delivery" / short id — the locators kitchen staff use.
export const tableLabel = (t) => {
  const tbl = String(t?.table || '').trim();
  if (tbl && tbl !== '—') return `TBL ${tbl}`;
  const ty = String(t?.type || 'dine-in').toLowerCase();
  if (ty === 'takeaway') return 'Takeaway';
  if (ty === 'delivery') return 'Delivery';
  return 'Counter';
};

const TYPE_LABEL = { dine: 'Dine-in', 'dine-in': 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };
export const typeLabel = (t) => TYPE_LABEL[String(t?.type || '').toLowerCase()] || 'Dine-in';

// mm:ss (h:mm:ss past an hour). Neutral formatting — the colour hierarchy
// lives in the Timer component, not the number itself.
export const fmtTimer = (secs) => {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export const fmtClock = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
};
