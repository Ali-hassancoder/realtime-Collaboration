import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import * as authService from './auth.service.js';

const isProd = env.NODE_ENV === 'production';
const base = { httpOnly: true, secure: isProd, sameSite: 'lax' };

const accessCookie = { ...base, path: '/', maxAge: env.ACCESS_TOKEN_MINUTES * 60 * 1000 };
// Refresh cookie is only sent to auth endpoints
const refreshCookie = { ...base, path: '/api/auth', maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000 };

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, accessCookie);
  res.cookie('refresh_token', refreshToken, refreshCookie);
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
}

export async function register(req, res) {
  const result = await authService.register(req.validated.body, req.get('user-agent'));
  setAuthCookies(res, result);
  res.status(201).json({ success: true, data: { user: result.user } });
}

export async function login(req, res) {
  const result = await authService.login(req.validated.body, req.get('user-agent'));
  setAuthCookies(res, result);
  res.json({ success: true, data: { user: result.user } });
}

export async function refresh(req, res) {
  const raw = req.cookies?.refresh_token;
  if (!raw) throw new AppError(401, 'REFRESH_INVALID', 'Please log in again.');
  try {
    const result = await authService.refresh(raw, req.get('user-agent'));
    setAuthCookies(res, result);
    res.json({ success: true, data: { user: result.user } });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.refresh_token);
  clearAuthCookies(res);
  res.json({ success: true, data: null });
}

export function me(req, res) {
  res.json({ success: true, data: { user: req.user } });
}

export async function verifyEmail(req, res) {
  await authService.verifyEmail(req.validated.body.token);
  res.json({ success: true, data: null });
}

export async function resendVerification(req, res) {
  await authService.resendVerification(req.user);
  // 202, not 200: the meaningful outcome is the email arriving, which the API cannot confirm
  res.status(202).json({ success: true, data: null });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.validated.body.email);
  // Same response for known and unknown emails: no account enumeration through this endpoint
  res.status(202).json({ success: true, data: null });
}

export async function resetPassword(req, res) {
  const { token, password } = req.validated.body;
  await authService.resetPassword(token, password);
  res.json({ success: true, data: null });
}