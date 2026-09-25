const API_BASE = '/api/v1';
const TOKEN_KEY = 'mesa_token';
const REFRESH_KEY = 'mesa_refresh_token';
const USER_KEY = 'mesa_user';
const DEVICE_KEY = 'mesa_device_id';
const SESSION_NOTICE_KEY = 'mesa_session_notice';

let accessToken = localStorage.getItem(TOKEN_KEY) || null;
let refreshToken = localStorage.getItem(REFRESH_KEY) || null;

// A persisted token without a persisted user is a half-dead session (token
// expired, or the user payload lost/corrupt). RootRoute decides "logged in"
// from the token while AppShell decides from the user payload — with partial
// state one redirects to /dashboard and the other back to /, an infinite loop
// behind a blank page. Normalize once at load: no user, no session. Every
// legit flow sets both (establishSession/authorizeSession) or clears both.
if (accessToken && !getApiUser()) {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}
// Single-flight guard so a burst of parallel 401s (menu, categories, tables,
// settings all at once) triggers exactly one refresh, not one per caller.
let refreshInFlight = null;

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
  // A session is only real when BOTH halves exist: the token and its user
  // payload. Token-only means expired/partial — treated as logged out so every
  // guard (RootRoute, AppShell, RoleProvider) agrees on one answer.
  return Boolean(accessToken) && Boolean(getApiUser());
}

// Persist a clock-in session and tell every provider to re-read it.
export function establishSession(token, user) {
  accessToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(SESSION_NOTICE_KEY);
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
  const refresh = res.tokens?.refresh_token;
  if (refresh) {
    refreshToken = refresh;
    localStorage.setItem(REFRESH_KEY, refresh);
  }
  establishSession(res.tokens.access_token, hydrated);
  return hydrated;
}

// Drop the session and flip the shell back to the clock-in screen. The
// refresh token dies with the session: keeping it after logout would leave a
// dead token parked in localStorage, and the next session's first 401 would
// waste a refresh attempt against an expired token (or, worse, succeed and
// resurrect a session that was meant to be gone).
export function clearApiSession() {
  accessToken = null;
  refreshToken = null;
  setElevationToken(null);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('mesa-session'));
}

// Exchange the stored refresh token for a fresh access/refresh pair. Built on
// the refreshInFlight single-flight guard so a burst of parallel 401s shares
// one refresh instead of hammering the endpoint. The caller inspects the
// returned Response status (200/204 -> retry with the new access token, 401 ->
// refresh token itself is dead).
async function refreshAccessTokenOnce() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': getDeviceId()
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        const access = data?.tokens?.access_token;
        const nextRefresh = data?.tokens?.refresh_token;
        if (access) {
          accessToken = access;
          localStorage.setItem(TOKEN_KEY, access);
        }
        if (nextRefresh) {
          refreshToken = nextRefresh;
          localStorage.setItem(REFRESH_KEY, nextRefresh);
        }
      }
      return res;
    } finally {
      // Always release the flight slot. If the refresh fetch itself throws
      // (dead network, bad JSON), waiting callers share the rejection and the
      // NEXT 401 must be able to start a fresh refresh — never a reused
      // rejected promise that would wedge the session until reload.
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request(path, opts) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Id': getDeviceId()
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // The elevation token is strictly single-use. Snapshot whether THIS request
  // carries it: (a) so the header is attached exactly when a step-up action is
  // actually in flight, and (b) so a 401 from the elevation retry is surfaced
  // to the PIN prompt instead of being "refreshed" away. The token is dropped
  // the moment the request lands — a lingering one would otherwise stamp every
  // unrelated request with the header and disable the refresh leg for all of
  // them via a stale codeHasElevation().
  const carriedElevation = Boolean(elevationToken);
  if (carriedElevation) headers['X-Elevation-Token'] = elevationToken;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } finally {
    if (carriedElevation) setElevationToken(null);
  }
  if (res.status === 401 && !(opts.skipRefresh) && !carriedElevation) {
    const refreshed = await refreshAccessTokenOnce();
    if (refreshed && (refreshed.status === 200 || refreshed.status === 204)) {
      // retry the original request with the fresh access token
      const retry = await fetch(`${API_BASE}${path}`, {
        method: opts.method || 'GET',
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      res = retry;
    } else if (refreshed?.status === 401) {
      // refresh token itself is dead — session truly expired
      const dead = new Error('session expired');
      dead.status = 401;
      localStorage.setItem(SESSION_NOTICE_KEY, 'expired');
      window.dispatchEvent(new Event('mesa-session-expired'));
      throw dead;
    }
  }
  if (!res.ok) {
    let detail = '';
    let code = '';
    let action = '';
    let payload = null;
    try {
      const body = await res.json();
      detail = body?.error || '';
      code = body?.code || '';
      action = body?.action || '';
      payload = body;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(detail || `request failed: ${res.status}`);
    err.status = res.status;
    err.code = code;
    err.action = action;
    err.body = payload; // structured fields (e.g. pin_locked_until) ride along
    err.remaining = typeof payload?.remaining === 'number' ? payload.remaining : undefined;
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