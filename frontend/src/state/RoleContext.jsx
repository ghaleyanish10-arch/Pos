import { createContext, useContext, useEffect, useState } from 'react';
import { api, getApiUser, hasApiSession, establishSession, clearApiSession, getDeviceId } from '../api/client';
import { navGroups } from '../data/nav';

export const ROLES = {
  cashier: { label: 'Cashier', defaultPath: '/front-of-house', initials: 'CA' },
  kitchen: { label: 'Kitchen', defaultPath: '/kds', initials: 'KI' },
  manager: { label: 'Manager', defaultPath: '/', initials: 'MA' },
  boss: { label: 'Boss', defaultPath: '/', initials: 'BO' }
};

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

export function frontendRole(dbRole) {
  return DB_ROLE_MAP[dbRole] || 'manager';
}

const allNavPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

const ROLE_ALLOWED = {
  cashier: new Set([
    '/',
    '/register',
    '/orders',
    '/transactions',
    '/manual-payment',
    '/bookings',
    '/front-of-house',
    '/delivery'
  ]),
  kitchen: new Set(['/', '/kds']),
  manager: new Set(allNavPaths.filter((p) => !['/manual-payment', '/permissions', '/settings', '/audit', '/system-health'].includes(p)).concat('/')),
  boss: new Set(allNavPaths.concat('/'))
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
    <RoleContext.Provider value={{ role, session, clockIn, clockOut }}>
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
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed.has(i.path)) }))
    .filter((g) => g.items.length > 0)
    .map((g) => {
      if (role === 'kitchen' && g.index === '04') {
        return { ...g, title: 'POS · Core operations' };
      }
      return g;
    });
}