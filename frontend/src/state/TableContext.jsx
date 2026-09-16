import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { floorRooms as staticFloorRooms, floorTables as staticFloorTables } from '../data/pos';
import api from '../api/client';

const TableContext = createContext(null);

const STORAGE_KEY = 'mesa_table_states';
const RENAME_KEY = 'mesa_table_renames';
const SEATS_KEY = 'mesa_table_seats';
const ROOMS_KEY = 'mesa_table_rooms';
const TABLE_ROOMS_KEY = 'mesa_table_room_map';

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
 * Live table states shared across the app. The floor plan ships demo states;
 * anything that happens for real — a guest scanning the table QR, an order
 * placed against the table, payment closing the check — lands here and every
 * surface (Front of House, Register, customer register, Bookings) reads the
 * same data.
 *
 * Boss/manager can also configure the floor here:
 *  - renameTable / setSeats — table display name and seat count
 *  - addRoom / renameRoom / removeRoom / setRoom — room layout
 *
 * states:   { [tableInternalName]: 'Open' | 'Seated' | 'Check dropped' | 'Needs attention' }
 * rooms:    ['Hall', 'Balcony', ...]
 * roomMap:  { [tableInternalName]: roomName }
 */
export function TableProvider({ children }) {
  const [overrides, setOverrides] = useState(() => readStored(STORAGE_KEY) || {});
  const [baseTables, setBaseTables] = useState(staticFloorTables);
  const [renames, setRenames] = useState(() => readStored(RENAME_KEY) || {});
  const [seatOverrides, setSeatOverrides] = useState(() => readStored(SEATS_KEY) || {});
  const [rooms, setRooms] = useState(() => readStored(ROOMS_KEY) || staticFloorRooms);
  const [roomMap, setRoomMap] = useState(() => readStored(TABLE_ROOMS_KEY) || {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/tables');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) {
          setBaseTables(data.map((t) => ({
            id: t.id,
            name: t.name,
            seats: t.seats,
            state: t.state || 'Open',
            detail: t.detail || '',
            room: staticFloorTables.find((s) => s.name === t.name)?.room || 'Hall'
          })));
        }
      } catch {
        /* keep static demo floor plan as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => persist(STORAGE_KEY, overrides), [overrides]);
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
      setBaseTables((prev) => prev.map((t) => (t.room === oldName ? { ...t, room: name } : t)));
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
      setBaseTables((prev) => prev.map((t) => (t.room === room ? { ...t, room: fallback } : t)));
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
      if (base !== undefined) return base;
      return baseTables.find((t) => t.name === name)?.seats ?? 2;
    },
    [seatOverrides, baseTables]
  );

  const roomOf = useCallback(
    (name, base) => roomMap[name] || base || rooms[0] || 'Hall',
    [roomMap, rooms]
  );

  const stateOf = useCallback(
    (name) => overrides[name] || baseTables.find((t) => t.name === name)?.state || 'Open',
    [overrides, baseTables]
  );

  const setState = useCallback((name, state) => {
    if (!name) return;
    setOverrides((prev) => (prev[name] === state ? prev : { ...prev, [name]: state }));
  }, []);

  /** A guest scanned this table's QR — seat the table unless a check is already dropped. */
  const occupyTable = useCallback(
    (name) => {
      if (!name) return false;
      const current = stateOf(name);
      if (current === 'Seated' || current === 'Check dropped') return false;
      setState(name, 'Seated');
      return true;
    },
    [stateOf, setState]
  );

  /** An order landed for this table — it is definitively occupied now. */
  const markOrdered = useCallback(
    (name) => {
      if (!name) return;
      setState(name, 'Seated');
    },
    [setState]
  );

  /** Payment / check settled — the table turns over and is free again. */
  const freeTable = useCallback(
    (name) => {
      if (!name) return;
      setState(name, 'Open');
    },
    [setState]
  );

  const tables = useMemo(
    () => baseTables.map((t) => ({
      ...t,
      state: stateOf(t.name),
      seats: seatsOf(t.name, t.seats),
      room: roomOf(t.name, t.room)
    })),
    [baseTables, stateOf, seatsOf, roomOf]
  );

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
      occupiedCount,
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
    [tables, rooms, stateOf, setState, occupyTable, markOrdered, freeTable, occupiedCount, renameTable, labelOf, setSeats, seatsOf, addRoom, renameRoom, removeRoom, setRoom, roomOf]
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTables() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTables must be used within TableProvider');
  return ctx;
}
