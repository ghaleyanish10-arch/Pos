import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { MenuIcon, XIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SyncChip } from './SyncChip';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { RestrictedState } from '../role/RestrictedState';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { allNavItems } from '../../data/nav';
import { canAccess, useRole } from '../../state/RoleContext';

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const [offline, setOffline] = useState(false);
  const { pathname } = useLocation();
  const { role } = useRole();
  const current = allNavItems.find((i) => i.path === pathname) ||
    allNavItems.find((i) => i.path !== '/' && pathname.startsWith(i.path + '/'));
  const allowed = canAccess(role, pathname);

  return (
    <div className="flex h-full w-full bg-canvas">
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
            <RoleSwitcher />
          </div>
        </header>

        <main className="scroll-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">
          {allowed ? (
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