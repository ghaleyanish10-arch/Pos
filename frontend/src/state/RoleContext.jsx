import { createContext, useContext, useEffect, useState } from 'react';
import { api, getApiUser, hasApiSession, establishSession, clearApiSession, clearElevationToken, getDeviceId } from '../api/client';
import { navGroups } from '../data/nav';

export const ROLES = {
  cashier: { label: 'Cashier', defaultPath: '/front-of-house', initials: 'CA' },
  kitchen: { label: 'Kitchen', defaultPath: '/kds', initials: 'KI' },
  manager: { label: 'Manager', defaultPath: '/', initials: 'MA' },
  boss: { label: 'Boss', defaultPath: '/', initials: 'BO' }
};

// Switchable hats. "Admin" is the owner/boss realm; the rest are the staff
// views an owner or manager can wear without logging out. Switching requires
// the staff member's own PIN — the same one clock-in uses.
export const SWITCHABLE_ROLES = [
  { key: 'kitchen', label: 'Kitchen', icon: 'Kitchen' },
  { key: 'manager', label: 'Manager', icon: 'Manager' },
  { key: 'cashier', label: 'Cashier', icon: 'Cashier' },
  { key: 'admin', label: 'Admin', icon: 'Admin' }
];

export const ROLE_IDS = ['cashier', 'kitchen', 'manager', 'boss'];

// DB role string -> frontend role id. Unknown roles fall through to manager
// so a POS terminal stays usable (with manager default paths) rather than
// hard-failing on an untyped account.
const DB_ROLE_MAP = {
  'Cashier': 'cashier',
  'Kitchen': 'kitchen',
  'Store Manager': 'manager',
  'Corporate Admin': 'boss'
};

// Frontend role id -> switch-role key. The boss session maps to 'admin'
// because that is the key the backend's switchableRoles table accepts.
export const SWITCH_KEY_FOR_ROLE = { cashier: 'cashier', kitchen: 'kitchen', manager: 'manager', boss: 'admin' };

export function frontendRole(dbRole) {
  return DB_ROLE_MAP[dbRole] || 'manager';
}

const allNavPaths = navGroups.flatMap((g) =>
  g.items.flatMap((i) => [i.path, ...(i.children || []).map((c) => c.path)])
);

const ROLE_ALLOWED = {
  cashier: new Set([
    '/',
    '/dashboard',
    '/register',
    '/orders',
    '/transactions',
    '/transactions-list',
    '/manual-payment',
    '/bookings',
    '/front-of-house',
    '/delivery',
    '/alerts',
    '/staff'
  ]),
  kitchen: new Set(['/', '/dashboard', '/kds', '/alerts', '/staff']),
  // Payroll is manager/admin only — mirrors the backend's RequireRole gate.
  manager: new Set(allNavPaths.filter((p) => !['/manual-payment', '/permissions', '/settings', '/audit', '/system-health'].includes(p)).concat(['/', '/alerts', '/staff'])),
  boss: new Set(allNavPaths.concat('/', '/alerts', '/staff'))
};

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [session, setSession] = useState(() => (hasApiSession() ? getApiUser() || null : null));

  useEffect(() => {
    const sync = () => setSession(hasApiSession() ? getApiUser() || null : null);
    window.addEventListener('mesa-session', sync);
    return () => window.removeEventListener('mesa-session', sync);
  }, []);

  const clockIn = async (userId, pin) => {
    const res = await api('/auth/clock-in', {
      method: 'POST',
      body: { user_id: userId, pin, device_id: getDeviceId() }
    });
    establishSession(res.token, res.user);
    return res.user;
  };

  // Re-wear the session as another role after re-entering the staff PIN.
  // The server re-mints a full shift session for the target role, so every
  // RequireRole gate genuinely reflects the worn hat — no client-side faking.
  const switchRole = async (roleKey, pin) => {
    const res = await api('/auth/switch-role', {
      method: 'POST',
      body: { role: roleKey, pin }
    });
    // A new hat starts clean: any step-up token borrowed under the old one
    // must not carry over.
    clearElevationToken();
    establishSession(res.token, res.user);
    return res.user;
  };

  const clockOut = async () => {
    const user = getApiUser();
    try {
      if (user) {
        await api('/auth/clock-out', {
          method: 'POST',
          body: { user_id: user.id, device_id: getDeviceId() }
        });
      }
    } finally {
      clearApiSession();
    }
  };

  const role = session ? frontendRole(session.role) : null;

  // Idle timeout: any clocked-in terminal with no interaction returns to the
  // roster, like a shared POS being handed back. Configurable via
  // VITE_IDLE_TIMEOUT_MIN or the mesa_idle_min localStorage override.
  useEffect(() => {
    if (!role) return undefined;
    let timer = null;
    const minutes = Math.max(
      1,
      Number(localStorage.getItem('mesa_idle_min')) ||
        Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN) ||
        15
    );
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => clearApiSession(), minutes * 60 * 1000);
    };
    arm();
    const reset = () => arm();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('scroll', reset, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('scroll', reset);
    };
  }, [role]);

  return (
    <RoleContext.Provider value={{ role, session, clockIn, clockOut, switchRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

export function canAccess(role, path) {
  if (!role) return false;
  const allowed = ROLE_ALLOWED[role];
  if (allowed.has(path)) return true;
  for (const p of allowed) {
    if (p !== '/' && p !== '*' && path.startsWith(p + '/')) return true;
  }
  return false;
}

export function visibleGroupsFor(role) {
  if (!role) return [];
  const allowed = ROLE_ALLOWED[role];
  return navGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => allowed.has(i.path))
        .map((i) => ({
          ...i,
          children: (i.children || []).filter((c) => allowed.has(c.path))
        }))
        .map((i) => (i.children && i.children.length === 0 ? { ...i, children: undefined } : i))
    }))
    .filter((g) => g.items.length > 0);
}