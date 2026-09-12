import { createContext, useContext, useState } from 'react';
import { navGroups } from '../data/nav';

export const ROLES = {
  cashier: { label: 'Cashier', defaultPath: '/front-of-house', initials: 'CA' },
  kitchen: { label: 'Kitchen', defaultPath: '/kds', initials: 'KI' },
  manager: { label: 'Manager', defaultPath: '/', initials: 'MA' },
  boss: { label: 'Boss', defaultPath: '/', initials: 'BO' }
};

export const ROLE_IDS = ['cashier', 'kitchen', 'manager', 'boss'];

const allNavPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

const ROLE_ALLOWED = {
  cashier: new Set([
    '/',
    '/register',
    '/orders',
    '/refunds',
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
  const [role, setRole] = useState('manager');
  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>);

}

export function useRole() {
  return useContext(RoleContext);

}

export function canAccess(role, path) {
  return ROLE_ALLOWED[role].has(path);

}

export function visibleGroupsFor(role) {
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