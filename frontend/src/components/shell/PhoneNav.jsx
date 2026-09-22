import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BanknoteIcon,
  BellIcon,
  BookOpenIcon,
  BoxesIcon,
  CalendarClockIcon,
  ChefHatIcon,
  ClipboardListIcon,
  Grid2x2Icon,
  LogOutIcon,
  PlusIcon,
  UsersIcon
} from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { useRole } from '../../state/RoleContext';
import { useToast } from '../ui/Toast';

/**
 * Hand-held shell. The phone is a service device, so the tab bar is the floor
 * staff's five moves: Orders (or Kitchen), Tables, a Quick-actions button, and
 * Alerts + Staff. Everything else lives behind the "…" quick sheet.
 */
const TAB_ICON = 'h-5 w-5';

function TabItem({ to, label, icon, badge }) {
  return (
    <NavLink
      to={to}
      end={to === '/orders' || to === '/kds'}
      className={({ isActive }) =>
        `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold transition-colors duration-150 ease-soft ${
          isActive ? 'text-ink' : 'text-meta hover:text-ink'
        }`}
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-status-red px-0.5 text-[9px] font-black text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  );
}

const QUICK_GROUPS = [
  {
    headline: 'Service',
    items: [
      { label: 'New order', icon: <ClipboardListIcon className="h-4 w-4" />, to: '/register' },
      { label: 'Take payment', icon: <BanknoteIcon className="h-4 w-4" />, to: '/front-of-house' },
      { label: 'Kitchen board', icon: <ChefHatIcon className="h-4 w-4" />, to: '/kds' }
    ]
  },
  {
    headline: 'Stock & menu',
    items: [
      { label: 'Stock count', icon: <BoxesIcon className="h-4 w-4" />, to: '/inventory' },
      { label: "86'd items", icon: <BookOpenIcon className="h-4 w-4" />, to: '/menu' }
    ]
  },
  {
    headline: 'People & shift',
    items: [
      { label: 'New booking', icon: <CalendarClockIcon className="h-4 w-4" />, to: '/bookings' },
      { label: 'New customer', icon: <UsersIcon className="h-4 w-4" />, to: '/guests' }
    ]
  }
];

export function PhoneNav() {
  const toast = useToast();
  const navigate = useNavigate();
  const { role, clockOut } = useRole();
  const [quickOpen, setQuickOpen] = useState(false);

  const isKitchen = role === 'kitchen';

  const go = (to) => {
    setQuickOpen(false);
    navigate(to);
  };

  const clockOutAction = async () => {
    setQuickOpen(false);
    try {
      await clockOut();
      toast('Clock-in session ended', { tone: 'green' });
    } catch (e) {
      toast(e.message || 'Could not clock out', { tone: 'red' });
    }
  };

  const tabs = isKitchen ? [
    // The kitchen role can only reach /dashboard and /kds, so slot 2 is the
    // board — never a tab that would bounce to RestrictedState.
    { label: 'Kitchen', to: '/kds', icon: <ChefHatIcon className={TAB_ICON} /> },
    { label: 'Board', to: '/dashboard', icon: <Grid2x2Icon className={TAB_ICON} /> }
  ] : [
    { label: 'Orders', to: '/orders', icon: <ClipboardListIcon className={TAB_ICON} /> },
    { label: 'Tables', to: '/front-of-house', icon: <Grid2x2Icon className={TAB_ICON} /> }
  ];

  const trail = [
    { label: 'Alerts', to: '/alerts', icon: <BellIcon className={TAB_ICON} /> },
    { label: 'Staff', to: '/staff', icon: <UsersIcon className={TAB_ICON} /> }
  ];

  return (
    <>
      <nav
        aria-label="Phone navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-[560px] items-stretch px-2">
          {tabs.slice(0, 2).map((tab) => (
            <TabItem key={tab.to} {...tab} />
          ))}

          {/* quick actions — center button, opens a sheet */}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setQuickOpen((v) => !v)}
              aria-label="Quick actions"
              className="flex h-11 w-11 -translate-y-2 items-center justify-center rounded-full bg-ink text-white shadow-pop transition-transform duration-150 ease-soft hover:scale-105 active:scale-95">
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>

          {trail.map((tab) => (
            <TabItem key={tab.to} {...tab} />
          ))}
        </div>
      </nav>

      <BottomSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Quick actions"
        subtitle="Jump straight into the job — no menu hunting"
        footer={
          <button
            type="button"
            onClick={clockOutAction}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-bold text-status-red transition-colors duration-150 ease-soft hover:border-status-red/40">
            <LogOutIcon className="h-4 w-4" />
            End my shift
          </button>
        }>
        <div className="flex flex-col gap-4">
          {QUICK_GROUPS.map((g) => (
            <section key={g.headline}>
              <p className="mb-2 text-caption font-semibold text-meta">{g.headline}</p>
              <div className="flex flex-col gap-1.5">
                {g.items.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => go(a.to)}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm font-semibold text-ink transition-colors duration-150 ease-soft active:bg-canvas">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink">
                      {a.icon}
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}