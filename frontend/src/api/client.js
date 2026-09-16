const API_BASE = '/api/v1';
const TOKEN_KEY = 'mesa_token';
const USER_KEY = 'mesa_user';
const DEVICE_KEY = 'mesa_device_id';

let accessToken = localStorage.getItem(TOKEN_KEY) || null;

// Step-up elevation token: held in memory only — never localStorage — so it
// dies with the tab. It authorizes exactly one privileged action.
let elevationToken = null;

export function setElevationToken(token) {
  elevationToken = token || null;
}

export function clearElevationToken() {
  elevationToken = null;
}

// Stable per-browser device id, generated once and reused so clock-in/out and
// audit rows carry the same terminal identity.
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getApiUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function hasApiSession() {
  return Boolean(accessToken);
}

// Persist a clock-in session and tell every provider to re-read it.
export function establishSession(token, user) {
  accessToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('mesa-session'));
}

// Persist an email/password or OAuth session. The login endpoint returns a
// compact user; hydrate from /auth/me so the shell has name, role and the
// authoritative email_verified flag before the UI renders.
export async function authorizeSession(res) {
  const user = res?.user || {};
  let hydrated = user;
  try {
    const me = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
        Authorization: `Bearer ${res?.tokens?.access_token || ''}`
      }
    });
    if (me.ok) {
      const body = await me.json();
      if (body?.user) hydrated = body.user;
    }
  } catch {
    /* fall back to the login payload */
  }
  establishSession(res.tokens.access_token, hydrated);
  return hydrated;
}

// Drop the session and flip the shell back to the clock-in screen.
export function clearApiSession() {
  accessToken = null;
  setElevationToken(null);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('mesa-session'));
}

async function request(path, opts) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Id': getDeviceId()
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (elevationToken) headers['X-Elevation-Token'] = elevationToken;
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    let detail = '';
    let code = '';
    let action = '';
    try {
      const body = await res.json();
      detail = body?.error || '';
      code = body?.code || '';
      action = body?.action || '';
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(detail || `request failed: ${res.status}`);
    err.status = res.status;
    err.code = code;
    err.action = action;
    if (res.status === 401 && !code.startsWith('ELEVATION_')) {
      err.code = code;
    }
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function api(path, opts = {}) {
  try {
    return await request(path, opts);
  } catch (e) {
    // A dead/expired session cannot be healed by re-login: the terminal has no
    // credentials of its own. Surface the error and drop back to clock-in so
    // the next action prompts a fresh shift. Elevation failures stay as-is.
    if (e.status === 401 && !(e.code || '').startsWith('ELEVATION_')) {
      clearApiSession();
    }
    throw e;
  }
}

export default api;