import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOutIcon, MenuIcon, StoreIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TabletRail } from './TabletRail';
import { PhoneNav } from './PhoneNav';
import { SyncChip } from './SyncChip';
import { ClockIn } from '../../pages/ClockIn';
import { NotificationBell } from './NotificationBell';
import { RoleSwitcher } from './RoleSwitcher';
import { RestrictedState } from '../role/RestrictedState';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useToast } from '../ui/Toast';
import { useDevice } from '../../state/DeviceContext';
import { api } from '../../api/client';
import { useBackoffInterval } from '../../api/poll';
import { useNotifications } from '../../state/Notifications';
import { useSound } from '../../state/SoundContext';
import { useSettings } from '../../state/SettingsContext';
import { allNavItems } from '../../data/nav';
import { canAccess, frontendRole, ROLES, useRole, visibleGroupsFor } from '../../state/RoleContext';

// Reachable without a clocked-in session (terminal has no credentials of its own).
// /register/customer is a standalone public route outside this shell entirely.
const PUBLIC_PATHS = new Set([
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/callback'
]);

function StaffBadge() {
  const { session, clockOut } = useRole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session) return null;
  const meta = ROLES[frontendRole(session.role)];

  const logout = async () => {
    if (msg) return;
    setMsg(true);
    try {
      await clockOut();
    } catch (e) {
      setMsg(false);
      toast.error(e.message || 'Could not clock out.');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={msg}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Profile"
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 transition-colors duration-150 ease-soft hover:border-ink/30">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-caption font-bold text-white">
          {meta.initials}
        </span>
        <span className="hidden max-w-[140px] text-13 font-semibold text-ink sm:block">
          <span className="block truncate leading-tight">{session.name}</span>
          <span className="block text-micro font-medium text-meta">{meta.label}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-caption font-bold text-white">
              {meta.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-13 font-semibold text-ink">{session.name}</p>
              <p className="text-caption font-medium text-meta">{meta.label}</p>
            </div>
          </div>
          <Link
            to={`/team/${session.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-13 font-semibold text-ink transition-colors duration-150 ease-soft hover:bg-canvas">
            <UserRoundIcon className="h-4 w-4 text-meta" />
            View profile
          </Link>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={msg}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-13 font-semibold text-status-red transition-colors duration-150 ease-soft hover:bg-canvas disabled:opacity-60">
            <LogOutIcon className="h-4 w-4" />
            {msg ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Watches the ticket feed so a new order — e.g. one placed from a table QR on
 * a guest's phone — lands in the staff notification bell (with a toast)
 * without anyone having to stare at the Orders board. Tickets already on the
 * board when the terminal mounts are baseline and stay silent.
 */
function OrderAlerts() {
  const { add } = useNotifications();
  const toast = useToast();
  const { play } = useSound();
  const seen = useRef(null);

  const poll = useCallback(async () => {
    const res = await api('/kds/tickets?status=incoming');
    const list = res?.data || [];
    if (seen.current === null) {
      seen.current = new Set(list.map((t) => t.id));
      return;
    }
    let arrived = 0;
    list.forEach((t) => {
      if (seen.current.has(t.id)) return;
      seen.current.add(t.id);
      arrived += 1;
      const where = String(t.table || '').trim()
        ? `Table ${t.table}`
        : (t.tag || 'New order');
      add({
        type: 'order',
        title: `New order — ${where}`,
        body: `${(t.items || []).length} item${(t.items || []).length === 1 ? '' : 's'} sent to the kitchen`,
        silent: true // the grouped orderReceived chime covers this batch
      });
      toast.success(`New order — ${where}`);
    });
    if (arrived > 0) {
      // One chime for the batch — the bell badge counts every order.
      play('orderReceived', { groupKey: 'shell-orders' });
    }
  }, [add, toast, play]);

  // Polls every 15s; failures back off automatically (the hook backs off on
  // any thrown error) instead of spamming the dead API.
  useBackoffInterval(poll, 15000);

  return null;
}

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const { pathname } = useLocation();
  const { role } = useRole();
  const { settings } = useSettings();
  const { isPhone, isTablet, isDesktop } = useDevice();
  const current = allNavItems.find((i) => i.path === pathname) ||
    allNavItems.find((i) => i.path !== '/' && pathname.startsWith(i.path + '/'));
  const publicPage = PUBLIC_PATHS.has(pathname);

  // Breadcrumb trail: group title → current page (or the parent item when a
  // sub-page like /refunds is open).
  const crumb = (() => {
    if (publicPage) return null;
    for (const g of visibleGroupsFor(role)) {
      for (const item of g.items) {
        if (item.path === pathname || (item.path !== '/' && pathname.startsWith(item.path + '/'))) {
          return { group: g.title, label: item.label };
        }
        const child = (item.children || []).find((c) => c.path === pathname);
        if (child) return { group: g.title, label: item.label, sub: child.label };
      }
    }
    return null;
  })();


  // Shared-terminal gate: without a staff session, /terminal IS the clock-in
  // screen; any other protected path belongs behind the owner landing page.
  if (!role && !publicPage) {
    if (pathname === '/terminal') return <ClockIn />;
    return <Navigate to="/" replace />;
  }

  // Already clocked in but wandered back to the terminal route: the shift is
  // live, so the dashboard is where they belong.
  if (role && pathname === '/terminal') {
    return <Navigate to="/dashboard" replace />;
  }

  // Public auth flows own the full viewport — no app header/rail/nav. They
  // carry their own brand chrome (see components/auth/AuthChrome).
  if (publicPage) {
    return (
      <div className="flex h-full w-full">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </div>
    );
  }

  const allowed = publicPage || canAccess(role, pathname);

  const pageLabel = crumb?.sub || crumb?.label || settings.name || 'Mesa OS';
  const crumbHome = settings.name || 'Mesa OS';

  return (
    <div className="flex h-full w-full bg-canvas">
      <OrderAlerts />
      {isDesktop && <Sidebar />}
      {isTablet && <TabletRail />}

      {mobileNav && isPhone &&
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileNav(false)}
            aria-hidden="true" />

          <div className="relative w-[86vw] max-w-[320px]">
            <Sidebar forceExpanded onNavigate={() => setMobileNav(false)} />
            <button
              type="button"
              onClick={() => setMobileNav(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-meta transition-colors duration-150 ease-soft hover:text-ink lg:hidden">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      }

      <div className={`flex min-w-0 flex-1 flex-col ${isTablet ? 'ml-[72px]' : ''}`}>
        <header className={`sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/90 backdrop-blur ${
          isPhone ? 'px-4' : isTablet ? 'px-6' : 'px-8'
        }`}>
          <div className="flex min-w-0 items-center gap-3">
            {isPhone && (
              <button
                type="button"
                onClick={() => setMobileNav((v) => !v)}
                className="rounded-lg border border-line bg-surface p-2 text-ink"
                aria-label="Toggle navigation">
                {mobileNav ? <XIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
              </button>
            )}
            <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
              {isPhone ? (
                <span className="font-semibold text-ink">{pageLabel}</span>
              ) : (
                <>
                  <Link to="/" className="text-meta hover:text-ink">
                    {crumbHome}
                  </Link>
                  {crumb &&
                    <>
                      <span className="px-1.5 text-meta">/</span>
                      <span className="text-meta">{crumb.group}</span>
                      <span className="px-1.5 text-meta">/</span>
                      <span className="font-semibold text-ink">{crumb.sub || crumb.label}</span>
                    </>
                  }
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 lg:flex">
              <StoreIcon className="h-3.5 w-3.5 shrink-0 text-meta" />
              <span className="max-w-[180px] truncate text-13 font-semibold text-ink">{settings.businessName}</span>
            </div>
            <SyncChip />
            <NotificationBell />
            {/* Role switching is a desk task — on the phone the StaffBadge menu
                plus quick-actions sheet already cover identity and moves. */}
            {!isPhone && <RoleSwitcher />}
            <StaffBadge />
          </div>
        </header>

        <main className={`scroll-thin flex-1 overflow-y-auto ${
          isPhone ? 'px-4 py-5 pb-32' : isTablet ? 'px-6 py-6' : 'px-8 py-8'
        }`}>
          {allowed ? (
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          ) : (
            <RestrictedState pageLabel={current?.label || pathname} />
          )}
        </main>
      </div>

      {isPhone && <PhoneNav />}
    </div>);

}