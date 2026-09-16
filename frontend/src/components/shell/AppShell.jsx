import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogOutIcon, MailCheckIcon, MenuIcon, XIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SyncChip } from './SyncChip';
import { ClockIn } from '../../pages/ClockIn';
import { NotificationBell } from './NotificationBell';
import { RestrictedState } from '../role/RestrictedState';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useToast } from '../ui/Toast';
import { api } from '../../api/client';
import { useNotifications } from '../../state/Notifications';
import { allNavItems } from '../../data/nav';
import { canAccess, frontendRole, ROLES, useRole } from '../../state/RoleContext';

// Reachable without a clocked-in session (terminal has no credentials of its own).
// /register/customer is a standalone public route outside this shell entirely.
const PUBLIC_PATHS = new Set([
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/login',
  '/signup',
  '/auth/callback'
]);

// Admin-dashboard paths the backend locks behind email verification for
// Corporate Admin (owner) accounts. Staff-role terminals stay fully open.
const ADMIN_DASH_PATHS = new Set([
  '/team',
  '/reports',
  '/marketing',
  '/online-store',
  '/fiscal',
  '/permissions',
  '/settings',
  '/audit'
]);

// Shown to an unverified owner clicking into an admin-dashboard page: the API
// answers 403 anyway; this makes the reason and the next step visible.
function VerifyGate({ email }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[440px] flex-col items-center justify-center">
      <div className="w-full rounded-card border border-line bg-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-tint-amber text-status-amber">
          <MailCheckIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-ink">Verify your email first</h1>
        <p className="mt-2 text-sm text-meta">
          We sent a 6-digit code to <span className="font-semibold text-ink">{email || 'your inbox'}</span>.
          Admin tools unlock once it&apos;s entered.
        </p>
        <Link
          to={`/verify-email${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-ink px-6 text-sm font-bold text-white transition-opacity duration-150 ease-soft hover:opacity-90">
          Enter verification code
        </Link>
        <p className="mt-3 text-xs text-meta">
          Staff registers, orders and KDS keep working — only admin pages are gated.
        </p>
      </div>
    </div>
  );
}

function StaffBadge() {
  const { session, clockOut } = useRole();
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
      window.alert(e.message || 'Could not clock out.');
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
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
          {meta.initials}
        </span>
        <span className="hidden max-w-[140px] text-[13px] font-semibold text-ink sm:block">
          <span className="block truncate leading-tight">{session.name}</span>
          <span className="block text-[10px] font-medium text-meta">{meta.label}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
              {meta.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{session.name}</p>
              <p className="text-[11px] font-medium text-meta">{meta.label}</p>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={msg}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-red-600 transition-colors duration-150 ease-soft hover:bg-canvas disabled:opacity-60">
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
  const seen = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api('/kds/tickets?status=incoming');
        const list = res?.data || [];
        if (seen.current === null) {
          seen.current = new Set(list.map((t) => t.id));
          return;
        }
        list.forEach((t) => {
          if (seen.current.has(t.id)) return;
          seen.current.add(t.id);
          const where = String(t.table || '').trim()
            ? `Table ${t.table}`
            : (t.tag || 'New order');
          add({
            type: 'order',
            title: `New order — ${where}`,
            body: `${(t.items || []).length} item${(t.items || []).length === 1 ? '' : 's'} sent to the kitchen`
          });
          toast.success(`New order — ${where}`);
        });
      } catch {
        /* backend unreachable — stay quiet, Orders/KDS show their own state */
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [add, toast]);

  return null;
}

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const [offline, setOffline] = useState(false);
  const { pathname } = useLocation();
  const { role, session } = useRole();
  const current = allNavItems.find((i) => i.path === pathname) ||
    allNavItems.find((i) => i.path !== '/' && pathname.startsWith(i.path + '/'));
  const publicPage = PUBLIC_PATHS.has(pathname);

  // Shared-terminal gate: no staff session means the whole shell is the
  // clock-in screen — nothing is navigable until someone is on shift.
  if (!role && !publicPage) {
    return <ClockIn />;
  }

  const allowed = publicPage || canAccess(role, pathname);

  // Owner-realm verify gate: an unverified Corporate Admin can still run the
  // terminal, but admin-dashboard pages show the verification prompt instead.
  const adminPath = [...ADMIN_DASH_PATHS].some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  const verifyGate = role === 'boss' && session?.email_verified === false && adminPath;

  return (
    <div className="flex h-full w-full bg-canvas">
      <OrderAlerts />
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {mobileNav &&
      <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
          className="absolute inset-0 bg-ink/30"
          onClick={() => setMobileNav(false)}
          aria-hidden="true" />
        
          <div className="relative">
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      }

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNav((v) => !v)}
              className="rounded-lg border border-line bg-surface p-2 text-ink lg:hidden"
              aria-label="Toggle navigation">
              
              {mobileNav ? <XIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
              <Link to="/" className="text-meta hover:text-ink">
                Mesa OS
              </Link>
              {current &&
              <>
                  <span className="px-1.5 text-meta">/</span>
                  <span className="font-semibold text-ink">{current.label}</span>
                </>
              }
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <SyncChip offline={offline} onToggle={() => setOffline((o) => !o)} />
            <button
              type="button"
              onClick={() => setOffline((o) => !o)}
              className="hidden h-9 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-meta transition-colors duration-150 ease-soft hover:text-ink sm:flex">
              
              Simulate {offline ? 'online' : 'offline'}
            </button>
            <NotificationBell />
            <StaffBadge />
          </div>
        </header>

        <main className="scroll-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
          {verifyGate ? (
            <VerifyGate email={session.email} />
          ) : allowed ? (
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          ) : (
            <RestrictedState pageLabel={current?.label || pathname} />
          )}
        </main>
      </div>
    </div>);

}