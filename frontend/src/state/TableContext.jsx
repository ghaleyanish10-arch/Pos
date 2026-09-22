import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { floorRooms as staticFloorRooms, floorTables as staticFloorTables } from '../data/pos';
import api from '../api/client';

const TableContext = createContext(null);

const RENAME_KEY = 'mesa_table_renames';
const SEATS_KEY = 'mesa_table_seats';
const ROOMS_KEY = 'mesa_table_rooms';
const TABLE_ROOMS_KEY = 'mesa_table_room_map';

// How long a QR-scan "browsing" hint lives before self-clearing. A real
// backend order state always overrides it well before expiry.
const BROWSE_TTL_MS = 2 * 60 * 1000;
const POLL_MS = 5000;

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Live table state shared across the app. The BACKEND is the single source of
 * truth: `GET /tables` derives each table's state from its newest open order
 * (an open order ⇒ Seated, no open order ⇒ Open / manual state), and carries
 * that order's id, total and item count. This context polls it every few
 * seconds and re-derives `tables` on every response, so every surface —
 * Front of House, Register, customer register, Bookings, Home — sees the same
 * live data and a payment on one device frees the table on every other device
 * within a poll.
 *
 * localStorage is used ONLY for what the backend has no column for:
 *  - renameTable / setSeats — table display name and seat count
 *  - addRoom / renameRoom / removeRoom / setRoom — room layout
 *
 * The one exception to server truth is `occupyTable`: a guest scanning a
 * table's QR seats the table locally as a short-lived "browsing" hint, so the
 * floor reacts instantly even before any order exists. It self-clears after
 * two minutes and the next server poll overrides it either way.
 */
export function TableProvider({ children }) {
  const [serverTables, setServerTables] = useState([]);
  const [serverOk, setServerOk] = useState(false);
  const [renames, setRenames] = useState(() => readStored(RENAME_KEY) || {});
  const [seatOverrides, setSeatOverrides] = useState(() => readStored(SEATS_KEY) || {});
  const [rooms, setRooms] = useState(() => readStored(ROOMS_KEY) || staticFloorRooms);
  const [roomMap, setRoomMap] = useState(() => readStored(TABLE_ROOMS_KEY) || {});
  const [browsing, setBrowsing] = useState({});

  const refreshTables = useCallback(async () => {
    try {
      const res = await api('/tables');
      const data = res?.data || [];
      if (data.length > 0) {
        setServerTables(data);
        setServerOk(true);
      }
    } catch {
      // no backend / session — keep the last known list (or static fallback)
      setServerOk(false);
    }
  }, []);

  useEffect(() => {
    refreshTables();
    const iv = setInterval(refreshTables, POLL_MS);
    return () => clearInterval(iv);
  }, [refreshTables]);

  // Expire stale browsing hints.
  useEffect(() => {
    const iv = setInterval(() => {
      setBrowsing((prev) => {
        const now = Date.now();
        const next = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (v > now) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => persist(RENAME_KEY, renames), [renames]);
  useEffect(() => persist(SEATS_KEY, seatOverrides), [seatOverrides]);
  useEffect(() => persist(ROOMS_KEY, rooms), [rooms]);
  useEffect(() => persist(TABLE_ROOMS_KEY, roomMap), [roomMap]);

  const renameTable = useCallback((name, label) => {
    if (!name) return;
    setRenames((prev) => {
      const next = { ...prev };
      if (label && label.trim() && label.trim() !== name) next[name] = label.trim();
      else delete next[name];
      return next;
    });
  }, []);

  const setSeats = useCallback((name, seats) => {
    if (!name) return;
    const n = Math.max(1, Math.min(30, Number(seats) || 0));
    setSeatOverrides((prev) => (prev[name] === n ? prev : { ...prev, [name]: n }));
  }, []);

  const addRoom = useCallback((room) => {
    const name = String(room || '').trim();
    if (!name) return false;
    let added = false;
    setRooms((prev) => {
      if (prev.some((r) => r.toLowerCase() === name.toLowerCase())) return prev;
      added = true;
      return [...prev, name];
    });
    return added;
  }, []);

  const renameRoom = useCallback((oldName, newName) => {
    const name = String(newName || '').trim();
    if (!oldName || !name || name === oldName) return false;
    let renamed = false;
    setRooms((prev) => {
      if (prev.some((r) => r.toLowerCase() === name.toLowerCase() && r !== oldName)) return prev;
      renamed = true;
      return prev.map((r) => (r === oldName ? name : r));
    });
    if (renamed) {
      setRoomMap((prev) => {
        const next = {};
        for (const [t, r] of Object.entries(prev)) next[t] = r === oldName ? name : r;
        return next;
      });
    }
    return renamed;
  }, []);

  const removeRoom = useCallback((room) => {
    let removed = false;
    let fallback = null;
    setRooms((prev) => {
      if (prev.length <= 1 || !prev.includes(room)) return prev;
      removed = true;
      fallback = prev.find((r) => r !== room);
      return prev.filter((r) => r !== room);
    });
    if (removed && fallback) {
      setRoomMap((prev) => {
        const next = {};
        for (const [t, r] of Object.entries(prev)) next[t] = r === room ? fallback : r;
        return next;
      });
    }
    return removed;
  }, []);

  const setRoom = useCallback((name, room) => {
    if (!name || !room) return;
    setRoomMap((prev) => (prev[name] === room ? prev : { ...prev, [name]: room }));
  }, []);

  const labelOf = useCallback(
    (name) => (name ? renames[name] || name : ''),
    [renames]
  );

  const seatsOf = useCallback(
    (name, base) => {
      if (seatOverrides[name] !== undefined) return seatOverrides[name];
      return base;
    },
    [seatOverrides]
  );

  const roomOf = useCallback(
    (name, base) => roomMap[name] || base || 'Hall',
    [roomMap]
  );

  // Merged floor: server rows are the truth for state/order info; static
  // demo tables fill in when there's no backend yet; local overrides dress
  // the result (label, seats, room).
  const tables = useMemo(() => {
    const source = serverOk && serverTables.length > 0
      ? serverTables.map((t) => ({
          id: t.id,
          name: t.name,
          seats: t.seats,
          state: t.state || 'Open',
          detail: t.detail || '',
          orderId: t.order_id || null,
          orderTotal: t.order_total || 0,
          itemCount: t.item_count || 0,
          room: staticFloorTables.find((s) => s.name === t.name)?.room || 'Hall'
        }))
      : staticFloorTables.map((t) => ({
          ...t,
          orderId: null,
          orderTotal: 0,
          itemCount: 0
        }));
    return source.map((t) => {
      const now = Date.now();
      const isBrowsing = browsing[t.name] > now && t.state === 'Open';
      return {
        ...t,
        state: isBrowsing ? 'Seated' : t.state,
        seats: seatsOf(t.name, t.seats),
        room: roomOf(t.name, t.room)
      };
    });
  }, [serverOk, serverTables, browsing, seatsOf, roomOf]);

  const byName = useMemo(() => {
    const m = {};
    for (const t of tables) m[t.name] = t;
    return m;
  }, [tables]);

  const stateOf = useCallback(
    (name) => byName[name]?.state || 'Open',
    [byName]
  );

  const setState = useCallback((name, state) => {
    if (!name) return;
    // Local optimistic hint; the poll confirms or overrides within seconds.
    // No caller currently relies on persisting manual states through here.
    setBrowsing((prev) => ({ ...prev, [name]: state === 'Open' ? 0 : Date.now() + BROWSE_TTL_MS }));
  }, []);

  /** A guest scanned this table's QR — local browsing hint until an order lands. */
  const occupyTable = useCallback(
    (name) => {
      if (!name) return false;
      const current = stateOf(name);
      if (current === 'Seated' || current === 'Check dropped') return false;
      setBrowsing((prev) => ({ ...prev, [name]: Date.now() + BROWSE_TTL_MS }));
      return true;
    },
    [stateOf]
  );

  /** An order landed for this table — the server already knows; refresh now. */
  const markOrdered = useCallback(
    () => { refreshTables(); },
    [refreshTables]
  );

  /** Payment / check settled — the backend closed the order; refresh now. */
  const freeTable = useCallback(
    () => { refreshTables(); },
    [refreshTables]
  );

  /**
   * Legacy no-op shims kept for call-site compatibility: the server poll is
   * the only writer of order snapshots now, so these just nudge a refresh.
   */
  const setTableOrder = useCallback(() => { refreshTables(); }, [refreshTables]);
  const replaceTableOrder = useCallback(() => { refreshTables(); }, [refreshTables]);
  const clearTableOrder = useCallback(() => { refreshTables(); }, [refreshTables]);

  /**
   * Live order info for a table, straight from the polled backend data:
   * { ref, orderId, total, itemCount, items: [] }. `items` is intentionally
   * empty here — callers that need line items fetch GET /pos/tables/:id/bill
   * (the poll would be far too chatty to carry items for every table).
   */
  const orderInfoOf = useCallback((name) => {
    const t = byName[name];
    if (!t || !t.orderId) return null;
    return {
      ref: `#${String(t.orderId).replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      orderId: t.orderId,
      items: [],
      total: t.orderTotal || 0,
      itemCount: t.itemCount || 0,
      placedAt: null,
      source: 'Live'
    };
  }, [byName]);

  const occupiedCount = useMemo(
    () => tables.filter((t) => t.state !== 'Open').length,
    [tables]
  );

  const value = useMemo(
    () => ({
      tables,
      rooms,
      stateOf,
      setState,
      occupyTable,
      markOrdered,
      freeTable,
      setTableOrder,
      replaceTableOrder,
      clearTableOrder,
      orderInfoOf,
      occupiedCount,
      refreshTables,
      renameTable,
      labelOf,
      setSeats,
      seatsOf,
      addRoom,
      renameRoom,
      removeRoom,
      setRoom,
      roomOf
    }),
    [tables, rooms, stateOf, setState, occupyTable, markOrdered, freeTable, setTableOrder, replaceTableOrder, clearTableOrder, orderInfoOf, occupiedCount, refreshTables, renameTable, labelOf, setSeats, seatsOf, addRoom, renameRoom, removeRoom, setRoom, roomOf]
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTables() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTables must be used within TableProvider');
  return ctx;
}
