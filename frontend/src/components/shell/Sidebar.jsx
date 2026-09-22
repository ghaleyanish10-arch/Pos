import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDownIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon
} from 'lucide-react';
import { useRole, visibleGroupsFor } from '../../state/RoleContext';
import { useSettings } from '../../state/SettingsContext';

const COLLAPSE_KEY = 'mesa_nav_collapsed';

function matchPath(path, pathname) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(path + '/');
}

function ItemRow({ item, pathname, onNavigate }) {
  const childActive = (item.children || []).some((c) => matchPath(c.path, pathname));
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const linkClass = ({ isActive }) =>
    `group relative flex flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors duration-150 ease-soft ${
      isActive
        ? 'bg-ink/5 font-semibold text-ink'
        : 'text-meta hover:bg-canvas hover:text-ink'
    }`;

  return (
    <li className="mb-0.5">
      <div className="relative flex w-full items-center">
        <NavLink to={item.path} onClick={onNavigate} className={linkClass} end={item.path === '/'}>
            {({ isActive }) => (
              <>
                <span
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ink transition-opacity duration-150 ease-soft"
                  style={{ opacity: isActive || item.children?.some((c) => matchPath(c.path, pathname)) ? 1 : 0 }}
                  aria-hidden="true" />
                <span className={`shrink-0 transition-colors duration-150 ease-soft ${isActive ? 'text-ink' : 'text-meta'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
                {item.alert && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-red" aria-label="Needs attention" />
                )}
              </>
            )}
          </NavLink>
          {(item.children || []).length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`Toggle ${item.label} submenu`}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink">
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform duration-200 ease-soft ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

      <AnimatePresence initial={false}>
        {open && (item.children || []).length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden">
            {item.children.map((c) => (
              <li key={c.path} className="pl-5">
                <NavLink
                  to={c.path}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg border-l-2 py-1.5 pl-4 text-13 transition-colors duration-150 ease-soft ${
                      isActive
                        ? 'border-ink font-semibold text-ink'
                        : 'border-line text-meta hover:border-meta hover:text-ink'
                    }`}>
                  <span className="truncate">{c.label}</span>
                  {c.alert && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-red" aria-label="Needs attention" />
                  )}
                </NavLink>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function CollapsedItem({ item, onNavigate, onOpenFly }) {
  const { pathname } = useLocation();
  const active = matchPath(item.path, pathname) || item.children?.some((c) => matchPath(c.path, pathname));
  const hasChildren = (item.children || []).length > 0;
  const ref = useRef(null);

  const common =
    'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150 ease-soft';

  return (
    <li className="flex justify-center py-0.5">
      {hasChildren ? (
        <button
          ref={ref}
          type="button"
          onClick={() => onOpenFly(item, ref)}
          title={item.label}
          aria-label={`${item.label} menu`}
          aria-haspopup="menu"
          className={`${common} ${active ? 'bg-ink/5 text-ink' : 'text-meta hover:bg-canvas hover:text-ink'}`}>
          {item.icon}
          {item.alert && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-red" aria-label="Needs attention" />
          )}
        </button>
      ) : (
        <NavLink
          to={item.path}
          onClick={onNavigate}
          title={item.label}
          className={({ isActive }) =>
            `${common} ${isActive ? 'bg-ink/5 text-ink' : 'text-meta hover:bg-canvas hover:text-ink'}`}>
          {item.icon}
          {item.alert && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-status-red" aria-label="Needs attention" />
          )}
        </NavLink>
      )}
    </li>
  );
}

export function Sidebar({ onNavigate, forceExpanded = false }) {
  const { role } = useRole();
  const groups = visibleGroupsFor(role);
  const { settings } = useSettings();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [fly, setFly] = useState(null); // { item, top, left }
  const navRef = useRef(null);

  const effectiveCollapsed = forceExpanded ? false : collapsed;
  const { pathname } = useLocation();

  useEffect(() => {
    if (!fly) return undefined;
    const close = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setFly(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setFly(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [fly]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  const openFly = (item, ref) => {
    const r = ref.current.getBoundingClientRect();
    setFly((f) =>
      f && f.item.path === item.path
        ? null
        : { item, top: r.top, left: r.right + 10 }
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className={`scroll-thin relative flex h-full shrink-0 flex-col overflow-y-auto border-r border-line bg-surface transition-[width] duration-200 ease-soft ${
        effectiveCollapsed ? 'w-[76px] px-3 py-5' : 'w-[264px] px-4 py-5'
      }`}>

      <div className={`mb-6 flex items-center ${effectiveCollapsed ? 'justify-center' : 'justify-between px-2'}`}>
        <NavLink
          to="/"
          onClick={onNavigate}
          title={settings.name}
          className={`flex items-center gap-2.5 ${effectiveCollapsed ? '' : 'min-w-0'}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-sm font-bold text-white">
            {(settings.name || 'M').charAt(0).toUpperCase()}
          </span>
          {!effectiveCollapsed && (
            <span className="truncate text-sm font-extrabold tracking-tight text-ink">
              {settings.name}
            </span>
          )}
        </NavLink>
        {!forceExpanded && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={effectiveCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink">
            {effectiveCollapsed
              ? <PanelLeftOpenIcon className="h-4 w-4" />
              : <PanelLeftCloseIcon className="h-4 w-4" />}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.index} className={effectiveCollapsed ? 'mb-4' : 'mb-5'}>
          {effectiveCollapsed ? (
            <div className="mb-1 flex items-center gap-2 px-0.5">
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-caption text-meta">{group.index}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ) : (
            <div className="mb-2 px-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-caption text-meta">{group.index}</span>
                <span className="text-caption font-semibold text-ink">
                  {group.title}
                </span>
              </div>
              {group.descriptor && (
                <p className="mt-0.5 text-caption text-meta">{group.descriptor}</p>
              )}
            </div>
          )}

          <ul className="space-y-0.5">
            {group.items.map((item) =>
              effectiveCollapsed ? (
                <CollapsedItem
                  key={item.path}
                  item={item}
                  onNavigate={onNavigate}
                  onOpenFly={openFly} />
              ) : (
                <ItemRow
                  key={item.path}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate} />
              )
            )}
          </ul>
        </div>
      ))}

      <div className="mt-auto pt-4">
        {effectiveCollapsed ? (
          <p className="text-center font-mono text-caption text-meta">v1.0</p>
        ) : (
          <p className="px-2 text-caption text-meta">
            <span className="font-mono">Mesa OS</span> · v1.0 · All systems operational
          </p>
        )}
      </div>

      <AnimatePresence>
        {fly && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            role="menu"
            style={{ top: fly.top, left: fly.left }}
            className="fixed z-50 w-60 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-pop">
            <div className="px-3 py-1.5">
              <p className="text-caption text-meta">{fly.item.label} menu</p>
            </div>
            {[fly.item, ...(fly.item.children || [])].map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => {
                  setFly(null);
                  onNavigate?.();
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-soft ${
                  matchPath(link.path, pathname)
                    ? 'bg-ink/5 font-semibold text-ink'
                    : 'text-meta hover:bg-canvas hover:text-ink'
                }`}>
                {link.icon && <span className="shrink-0">{link.icon}</span>}
                <span className="truncate">{link.label}</span>
                {link.alert && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-red" aria-label="Needs attention" />
                )}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}