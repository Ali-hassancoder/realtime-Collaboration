import { env } from '../lib/env';

// Auth endpoints must never trigger the refresh-and-retry flow
const NO_REFRESH = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

let refreshPromise = null;

// Shared by REST retries and the socket. Refresh tokens are single-use,
// so concurrent callers must share one call.
export function refreshSession() {
  refreshPromise ??= fetch(`${env.apiUrl}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function send(path, options) {
  return fetch(`${env.apiUrl}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

export async function apiRequest(path, options = {}) {
  let res = await send(path, options);

  if (res.status === 401 && !NO_REFRESH.includes(path) && (await refreshSession())) {
    res = await send(path, options);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    const err = new Error(body?.error?.message || 'Request failed');
    err.code = body?.error?.code || 'UNKNOWN_ERROR';
    err.status = res.status;
    err.details = body?.error?.details;
    throw err;
  }
  return body;
}

export const postJson = (path, data) =>
  apiRequest(path, { method: 'POST', body: JSON.stringify(data) });

export const getHealth = () => apiRequest('/api/health');