import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { soundEngine } from '../utils/sound';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const add = useCallback((n) => {
    setNotifications((prev) => [{
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date(),
      read: false,
      ...n
    }, ...prev]);
    // Every bell notification gets its subtle tone unless the caller already
    // made a more specific sound (order arrival, payment…) — the engine's
    // priority lock suppresses the generic tone in that case, so a new order
    // chimes once, not twice. Pass { silent: true } to opt out entirely.
    if (!n?.silent) soundEngine.play(n?.tone === 'critical' ? 'critical' : 'notification');
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, add, dismiss, markRead, markAllRead, clearAll }),
    [notifications, unreadCount, add, dismiss, markRead, markAllRead, clearAll]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}