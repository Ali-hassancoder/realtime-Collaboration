import { apiRequest, postJson } from './api';

export const registerUser = async (data) => (await postJson('/api/auth/register', data)).data.user;
export const loginUser = async (data) => (await postJson('/api/auth/login', data)).data.user;
export const logoutUser = () => apiRequest('/api/auth/logout', { method: 'POST' });

// Returns null when not logged in (instead of throwing), so routes can decide what to do
export async function getMe() {
  try {
    return (await apiRequest('/api/auth/me')).data.user;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}