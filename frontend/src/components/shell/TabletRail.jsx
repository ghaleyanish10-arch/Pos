import { NavLink } from 'react-router-dom';
import {
  ChefHatIcon,
  ClipboardListIcon,
  Grid2x2Icon,
  LayoutGridIcon,
  StoreIcon
} from 'lucide-react';
import { useRole } from '../../state/RoleContext';

/**
 * Counter-terminal rail. A tablet lives on the pass or behind the bar, so the
 * rail favours the four surfaces staff touch all shift: POS, tables, orders
 * and the kitchen — with the dashboard for the shift lead.
 */
function RailItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-bold transition-colors duration-150 ease-soft ${
          isActive ? 'bg-canvas text-ink' : 'text-meta hover:bg-canvas/60 hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span aria-hidden="true" className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-ink" />
          )}
          {icon}
          <span className="leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function TabletRail() {
  const { role } = useRole();
  const isKitchen = role === 'kitchen';

  const items = isKitchen
    ? [
        { label: 'Kitchen', to: '/kds', icon: <ChefHatIcon className="h-5 w-5" />, end: true },
        { label: 'Dashboard', to: '/dashboard', icon: <LayoutGridIcon className="h-5 w-5" />, end: true }
      ]
    : [
        { label: 'Register', to: '/register', icon: <StoreIcon className="h-5 w-5" /> },
        { label: 'Orders', to: '/orders', icon: <ClipboardListIcon className="h-5 w-5" />, end: true },
        { label: 'Tables', to: '/front-of-house', icon: <Grid2x2Icon className="h-5 w-5" />, end: true },
        { label: 'Kitchen', to: '/kds', icon: <ChefHatIcon className="h-5 w-5" />, end: true },
        { label: 'Dashboard', to: '/dashboard', icon: <LayoutGridIcon className="h-5 w-5" />, end: true }
      ];

  return (
    <aside
      aria-label="Terminal navigation"
      className="fixed bottom-0 left-0 top-0 z-30 flex w-[72px] flex-col items-center gap-2 border-r border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] pt-3">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-sm font-black text-white">
        M
      </div>
      {items.map((item) => (
        <RailItem key={item.to} {...item} />
      ))}
    </aside>
  );
}