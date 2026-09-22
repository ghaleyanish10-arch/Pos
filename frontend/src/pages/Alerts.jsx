import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellIcon,
  BoxesIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  MegaphoneIcon,
  ReceiptIcon,
  Trash2Icon,
  XIcon
} from 'lucide-react';
import { useNotifications } from '../state/Notifications';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';

const TYPE_META = {
  order: { label: 'Orders', tone: 'blue', icon: <ClipboardListIcon className="h-4 w-4" />, badge: 'bg-tint-blue text-status-blue' },
  stock: { label: 'Stock', tone: 'amber', icon: <BoxesIcon className="h-4 w-4" />, badge: 'bg-tint-amber text-status-amber' },
  invoice: { label: 'Invoices', tone: 'red', icon: <ReceiptIcon className="h-4 w-4" />, badge: 'bg-tint-red text-status-red' },
  booking: { label: 'Bookings', tone: 'purple', icon: <CalendarClockIcon className="h-4 w-4" />, badge: 'bg-tint-purple text-status-purple' },
  campaign: { label: 'Marketing', tone: 'green', icon: <MegaphoneIcon className="h-4 w-4" />, badge: 'bg-tint-green text-status-green' }
};

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Alerts() {
  const navigate = useNavigate();
  const { notifications, unreadCount, dismiss, markRead, markAllRead, clearAll } = useNotifications();
  const [filter, setFilter] = useState('All');

  const types = ['All', ...Object.keys(TYPE_META)];
  const filtered = filter === 'All' ? notifications : notifications.filter((n) => n.type === filter);

  const openFor = (n) => {
    markRead(n.id);
    if (n.type === 'stock') navigate('/inventory');
    else if (n.type === 'invoice') navigate('/invoices');
    else if (n.type === 'booking') navigate('/bookings');
    else if (n.type === 'order') navigate('/orders');
    else if (n.type === 'campaign') navigate('/marketing');
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Alerts</h1>
          <p className="mt-1 text-sm text-meta">
            {unreadCount > 0 ? `${unreadCount} unread — what needs your attention right now` : 'Nothing needs you right now'}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <CheckCheckIcon className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button size="sm" variant="outline" onClick={clearAll}>
              <Trash2Icon className="h-3.5 w-3.5" /> Clear all
            </Button>
          )}
        </div>
      </header>

      {/* type filter — one glance at what kind of trouble it is */}
      <nav aria-label="Alert type" className="scroll-thin -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {types.map((t) => {
          const meta = t === 'All' ? null : TYPE_META[t];
          const count = t === 'All'
            ? notifications.length
            : notifications.filter((n) => n.type === t).length;
          const active = filter === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(t)}
              className={`chip flex shrink-0 items-center gap-1.5 ${
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-surface text-meta hover:text-ink'
              }`}>
              {meta && meta.icon}
              {t}
              <span className={`font-mono text-xs ${active ? 'text-white/70' : 'text-meta'}`}>
                {count === 0 && t !== 'All' ? '' : count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* the list — alerts are actions, not logs */}
      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-shelf border border-dashed border-line bg-surface px-6 py-14 text-center">
            <BellIcon className="h-8 w-8 text-meta/50" />
            <p className="text-sm font-semibold text-ink">All clear</p>
            <p className="text-sm text-meta">
              {filter === 'All' ? 'New alerts will land here the moment something needs you.' : `No ${filter.toLowerCase()} alerts right now.`}
            </p>
          </div>
        )}

        {filtered.map((n) => {
          const meta = TYPE_META[n.type];
          return (
            <article
              key={n.id}
              onClick={() => openFor(n)}
              className={`flex cursor-pointer items-start gap-3 rounded-card border bg-surface p-3.5 transition-shadow duration-150 ease-soft ${
                n.read ? 'border-line' : 'border-status-blue/40 shadow-card'
              }`}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                meta ? meta.badge : 'bg-canvas text-meta'
              }`}>
                {meta ? meta.icon : <BellIcon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm leading-snug ${n.read ? 'text-meta' : 'font-semibold text-ink'}`}>
                    {n.title}
                  </p>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-status-blue" aria-label="Unread" />}
                </div>
                {n.body && <p className="mt-0.5 text-xs text-meta">{n.body}</p>}
                <div className="mt-1.5 flex items-center gap-2">
                  {meta && <Pill tone={meta.tone} className="!px-2 !py-0 text-[10px]">{meta.label}</Pill>}
                  <span className="text-micro text-meta">{timeAgo(n.time)}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                className="shrink-0 rounded-lg p-1.5 text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink">
                <XIcon className="h-4 w-4" />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}