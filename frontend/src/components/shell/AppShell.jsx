import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { MenuIcon, MonitorIcon, SmartphoneIcon, TabletIcon, XIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SyncChip } from './SyncChip';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { RestrictedState } from '../role/RestrictedState';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { allNavItems } from '../../data/nav';
import { canAccess, useRole } from '../../state/RoleContext';

const DEVICES = [
  { key: 'desktop', label: 'Desktop', Icon: MonitorIcon, width: null },
  { key: 'tablet', label: 'Tablet', Icon: TabletIcon, width: 768 },
  { key: 'phone', label: 'Phone', Icon: SmartphoneIcon, width: 390 }
];

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const [offline, setOffline] = useState(false);
  const [device, setDevice] = useState('desktop');
  const { pathname } = useLocation();
  const { role } = useRole();
  const current = allNavItems.find((i) => i.path === pathname);
  const allowed = canAccess(role, pathname);
  const preview = DEVICES.find((d) => d.key === device);

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

      {role === 'boss' && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-pop">
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDevice(d.key)}
              aria-pressed={device === d.key}
              title={`Preview on ${d.label}`}
              className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors duration-150 ease-soft ${
                device === d.key ? 'bg-ink text-white' : 'text-meta hover:text-ink'
              }`}>
              <d.Icon className="h-4 w-4" />
              {device === d.key && <span>{d.label}</span>}
            </button>
          ))}
        </div>
      )}

      {role === 'boss' && device !== 'desktop' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center gap-4 bg-ink/50 p-6">
          <div className="flex w-full max-w-[820px] items-center justify-between">
            <p className="text-sm font-bold text-white">
              {preview.label} preview · {preview.width}px
            </p>
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className="flex h-9 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 text-xs font-semibold text-white transition-colors duration-150 ease-soft hover:bg-white/20">
              <XIcon className="h-3.5 w-3.5" />
              Exit preview
            </button>
          </div>
          <div
            className="h-full w-full flex-1 overflow-hidden rounded-[32px] border-[12px] border-ink bg-white shadow-pop"
            style={{ width: preview.width }}>
            <iframe
              src={pathname}
              title={`${preview.label} preview`}
              className="h-full w-full bg-canvas"
              style={{ border: 0 }} />
          </div>
        </div>
      )}
    </div>);

}
