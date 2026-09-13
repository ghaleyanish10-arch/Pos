import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const OrderContext = createContext(null);

const STORAGE_KEY = 'mesa_incoming_orders';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

let nextId = Math.max(
  1050,
  ...readStored().map((t) => parseInt(String(t.id).replace('#', ''), 10) || 0)
) + 1;

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function OrderProvider({ children }) {
  const [incoming, setIncoming] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
    } catch {
      /* storage unavailable */
    }
  }, [incoming]);

  const addOrder = useCallback((cart, payMethod, { notes = '', allergy = '', server = 'Riya', type = 'dine-in', table = '—' } = {}) => {
    if (cart.length === 0) return null;
    const id = `#${nextId++}`;
    const ticket = {
      id,
      type,
      tag: 'Register',
      items: cart.map((l) => `${l.qty}× ${l.name}`),
      elapsed: '0 min',
      station: 'Kitchen',
      modifiers: [],
      timestamps: { placed: now(), fired: '—', served: '—' },
      payment: payMethod,
      server,
      table,
      notes,
      allergy
    };
    setIncoming((prev) => [...prev, ticket]);
    return ticket;
  }, []);

  const removeIncoming = useCallback((id) => {
    setIncoming((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const restoreOrder = useCallback((ticket) => {
    setIncoming((prev) => (prev.some((t) => t.id === ticket.id) ? prev : [...prev, ticket]));
  }, []);

  const value = useMemo(
    () => ({ incoming, addOrder, removeIncoming, restoreOrder }),
    [incoming, addOrder, removeIncoming, restoreOrder]
  );

  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrders must be used within OrderProvider');
  return ctx;
}
