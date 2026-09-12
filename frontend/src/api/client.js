const API_BASE = '/api/v1';
const TOKEN_KEY = 'mesa_token';
const USER_KEY = 'mesa_user';

let accessToken = localStorage.getItem(TOKEN_KEY) || null;
let loginInFlight = null;

export function getApiUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

async function login() {
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: import.meta.env.VITE_API_EMAIL || 'admin@mesa.os',
        password: import.meta.env.VITE_API_PASSWORD || 'admin123'
      })
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      const err = new Error('API unavailable');
      err.offline = true;
      throw err;
    }
    const data = await res.json();
    accessToken = data.tokens.access_token;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  })();
  try {
    return await loginInFlight;
  } finally {
    loginInFlight = null;
  }
}

async function request(path, opts) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function api(path, opts = {}) {
  try {
    if (!accessToken) await login();
    return await request(path, opts);
  } catch (e) {
    if (e.status === 401) {
      accessToken = null;
      localStorage.removeItem(TOKEN_KEY);
      try {
        await login();
        return await request(path, opts);
      } catch (e2) {
        e2.offline = true;
        throw e2;
      }
    }
    if (e.offline) throw e;
    const err = new Error('API unavailable');
    err.offline = true;
    throw err;
  }
}

export default api;