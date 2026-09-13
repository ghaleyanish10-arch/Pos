import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { floorTables } from '../data/pos';

const TableContext = createContext(null);

const STORAGE_KEY = 'mesa_table_states';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Live table states shared across the app. The floor plan ships demo states;
 * anything that happens for real — a guest scanning the table QR, an order
 * placed against the table, payment closing the check — lands here and every
 * surface (Front of House, Register, customer register) reads the same data.
 *
 * states: { [tableName]: 'Open' | 'Seated' | 'Check dropped' | 'Needs attention' }
 */
export function TableProvider({ children }) {
  const [overrides, setOverrides] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      /* storage unavailable */
    }
  }, [overrides]);

  const stateOf = useCallback(
    (name) => overrides[name] || floorTables.find((t) => t.name === name)?.state || 'Open',
    [overrides]
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
    () => floorTables.map((t) => ({ ...t, state: stateOf(t.name) })),
    [stateOf]
  );

  const occupiedCount = useMemo(
    () => tables.filter((t) => t.state !== 'Open').length,
    [tables]
  );

  const value = useMemo(
    () => ({ tables, stateOf, setState, occupyTable, markOrdered, freeTable, occupiedCount }),
    [tables, stateOf, setState, occupyTable, markOrdered, freeTable, occupiedCount]
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTables() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTables must be used within TableProvider');
  return ctx;
}
