import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useNotifications } from '../../state/Notifications';
import { canAccess, useRole } from '../../state/RoleContext';

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

// Where each notification type lives in the app. A click on the row takes
// the user straight there — sound/badge alone never strand the user.
const TYPE_TARGET = {
  order: '/orders',
  stock: '/inventory',
  inventory: '/inventory',
  invoice: '/invoices',
  booking: '/bookings',
  campaign: '/marketing',
  payment: '/transactions',
  refund: '/refunds',
  kds: '/kds',
  kitchen: '/kds',
  printer: '/settings?section=printers',
  system: '/system-health'
};

function NotifIcon({ type }) {
  return <span className={`block h-2 w-2 rounded-full ${toneDot[type] || toneDot.default}`} />;
}

export function NotificationBell() {
  const { notifications, unreadCount, dismiss, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const { role } = useRole();
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
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-red px-1 text-micro font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

{open && (
        <div className="fixed right-3 top-[4.5rem] z-50 w-[calc(100vw-1.5rem)] max-w-[380px] max-h-[480px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:absolute sm:right-0 sm:top-full sm:mt-2">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
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
            {notifications.map((n) => {
              const target = TYPE_TARGET[n.type];
              const canGo = target && canAccess(role, target.split('?')[0]);
              return (
              <div
                key={n.id}
                role={canGo ? 'link' : undefined}
                tabIndex={canGo ? 0 : undefined}
                onClick={() => {
                  markRead(n.id);
                  if (canGo) {
                    setOpen(false);
                    navigate(target);
                  }
                }}
                onKeyDown={(e) => {
                  if (canGo && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    markRead(n.id);
                    setOpen(false);
                    navigate(target);
                  }
                }}
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
                  <p className="mt-1 text-micro text-meta">{timeAgo(n.time)}</p>
                </div>
                {canGo && (
                  <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-meta opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                )}
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  className="shrink-0 p-0.5 text-meta opacity-0 group-hover:opacity-100 hover:text-ink transition-opacity">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}