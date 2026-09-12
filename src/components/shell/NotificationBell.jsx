import { useState, useRef, useEffect } from 'react';
import { BellIcon, XIcon } from 'lucide-react';
import { useNotifications } from '../../state/Notifications';

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

const toneDot = {
  stock: 'bg-status-amber',
  order: 'bg-status-blue',
  invoice: 'bg-status-red',
  booking: 'bg-status-purple',
  campaign: 'bg-status-green',
  default: 'bg-meta'
};

function NotifIcon({ type }) {
  return <span className={`block h-2 w-2 rounded-full ${toneDot[type] || toneDot.default}`} />;
}

export function NotificationBell() {
  const { notifications, unreadCount, dismiss, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink"
        aria-label="Notifications">
        <BellIcon className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-red px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[380px] max-h-[480px] rounded-xl border border-line bg-surface shadow-pop overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => { markAllRead(); }}
                className="text-xs font-semibold text-status-blue hover:text-ink transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto scroll-thin">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-meta">
                <BellIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`group flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ${
                  n.read ? 'opacity-60' : 'bg-tint-blue/20 hover:bg-canvas'}`}>
                <div className="mt-1 shrink-0">
                  <NotifIcon type={n.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug ${n.read ? 'text-meta' : 'font-medium text-ink'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-meta line-clamp-2">{n.body}</p>
                  )}
                  <p className="mt-1 text-[10px] text-meta">{timeAgo(n.time)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  className="shrink-0 p-0.5 text-meta opacity-0 group-hover:opacity-100 hover:text-ink transition-opacity">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}