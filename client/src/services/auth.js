import { apiRequest, postJson } from './api';

export const registerUser = async (data) => (await postJson('/api/auth/register', data)).data.user;
export const loginUser = async (data) => (await postJson('/api/auth/login', data)).data.user;
export const logoutUser = () => apiRequest('/api/auth/logout', { method: 'POST' });

// Phase 16: email verification + password reset. All token-bearing calls are POSTs; the
// emailed links point at client routes that forward the token here.
export const verifyEmail = (token) => postJson('/api/auth/verify-email', { token });
export const resendVerification = () => postJson('/api/auth/resend-verification', {});
export const forgotPassword = (email) => postJson('/api/auth/forgot-password', { email });
export const resetPassword = (token, password) => postJson('/api/auth/reset-password', { token, password });

// Returns null when not logged in (instead of throwing), so routes can decide what to do
export async function getMe() {
  try {
    return (await apiRequest('/api/auth/me')).data.user;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}