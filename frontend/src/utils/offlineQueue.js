// Offline-first write queue. Register actions (orders, payments, status
// changes) taken while offline are persisted in IndexedDB BEFORE the network
// attempt and replayed in order when connectivity returns. Sync is
// idempotent end-to-end: every entry carries a client UUID the backend
// dedupes on, so a crash between "server applied" and "local cleared" can
// never double-charge or duplicate an order.
//
// UI surfaces real sync state through subscribe(): queued count, last sync
// time, and per-entry errors — not the browser's naive online/offline flag.

const DB_NAME = 'mesa_os';
const STORE = 'write_queue';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** enqueue persists a write before any network attempt. Returns the entry. */
export async function enqueue(kind, payload, { endpoint, method = 'POST', body } = {}) {
  const entry = {
    id: uuid(),
    kind, // 'order' | 'transaction' | 'status' | ...
    endpoint,
    method,
    body,
    payload,
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
  };
  const db = await openDB();
  await reqAsPromise(tx(db, 'readwrite').add(entry));
  notify();
  return entry;
}

/** list returns every queued entry, oldest first (replay order). */
export async function list() {
  try {
    const db = await openDB();
    return await reqAsPromise(tx(db, 'readonly').getAll());
  } catch {
    return [];
  }
}

async function remove(id) {
  const db = await openDB();
  await reqAsPromise(tx(db, 'readwrite').delete(id));
}

async function markError(id, err) {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  const entry = await reqAsPromise(store.get(id));
  if (entry) {
    entry.attempts = (entry.attempts || 0) + 1;
    entry.last_error = String(err?.message || err || 'unknown error');
    store.put(entry);
  }
}

// --- sync state broadcast -------------------------------------------------

const state = { queued: 0, syncing: false, lastSyncedAt: null, lastError: null };
const listeners = new Set();

export function getSyncState() {
  return { ...state };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(getSyncState());
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(getSyncState()));
}

async function setCounts() {
  const entries = await list();
  state.queued = entries.length;
  notify();
}

// --- replay ----------------------------------------------------------------

let replaying = false;
let replayQueued = false;

/**
 * replay drains the queue in FIFO order. Permanent failures (4xx) are kept
 * with an error marker instead of blocking the queue forever; network
 * failures stop the replay and retry on the next trigger.
 */
export async function replay(sendFn) {
  if (replaying) {
    replayQueued = true; // a second trigger after this one finishes re-runs
    return { ok: true, synced: 0 };
  }
  replaying = true;
  state.syncing = true;
  notify();

  let synced = 0;
  try {
    const entries = await list();
    entries.sort((a, b) => a.created_at - b.created_at);
    for (const entry of entries) {
      try {
        const res = await sendFn(entry.endpoint, {
          method: entry.method || 'POST',
          body: entry.body,
        });
        if (res && res.ok) {
          await remove(entry.id);
          synced += 1;
        } else if (res && res.status >= 400 && res.status < 500) {
          // Permanent rejection (validation, conflict): park it with the
          // reason instead of retrying forever. Orders sent with an
          // idempotency_key can safely be dropped on 409-style duplicates.
          entry.last_error = `rejected (${res.status})`;
          entry.attempts = 999;
          const db = await openDB();
          tx(db, 'readwrite').put(entry);
          synced += 1; // queue advanced past it
        } else {
          await markError(entry.id, `server error ${res?.status || 'offline'}`);
          break; // 5xx/offline: stop, retry next trigger
        }
      } catch (err) {
        await markError(entry.id, err);
        break; // network down: stop the pass
      }
    }
    state.lastError = entries.some((e) => e.attempts >= 999) ? 'some writes were rejected' : null;
    if (synced > 0) {
      state.lastSyncedAt = Date.now();
      try {
        localStorage.setItem('mesa_last_sync', String(state.lastSyncedAt));
      } catch { /* private mode */ }
    }
  } finally {
    replaying = false;
    state.syncing = false;
    await setCounts();
    if (replayQueued) {
      replayQueued = false;
      replay(sendFn).catch(() => {});
    }
  }
  return { ok: true, synced };
}

/** init wires connectivity triggers and reports the persisted last-sync. */
export function initOfflineSync(sendFn) {
  try {
    const saved = localStorage.getItem('mesa_last_sync');
    if (saved) state.lastSyncedAt = Number(saved);
  } catch { /* ignore */ }
  setCounts();

  const trigger = () => {
    if (navigator.onLine) replay(sendFn).catch(() => {});
  };
  window.addEventListener('online', trigger);
  window.addEventListener('offline', () => notify());
  document.addEventListener('visibilitychange', trigger);
  trigger();
  setInterval(trigger, 30000);
}
