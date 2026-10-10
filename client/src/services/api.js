import { env } from '../lib/env';

export async function apiRequest(path, options = {}) {
  const res = await fetch(`${env.apiUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    const err = new Error(body?.error?.message || 'Request failed');
    err.code = body?.error?.code || 'UNKNOWN_ERROR';
    err.status = res.status;
    throw err;
  }
  return body;
}

export const getHealth = () => apiRequest('/api/health');