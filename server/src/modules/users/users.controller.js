import { clearAuthCookies } from '../auth/auth.controller.js';
import * as service from './users.service.js';

export async function updateMe(req, res) {
  const user = await service.updateProfile(req.user, req.validated.body);
  res.json({ success: true, data: { user } });
}

export async function changePassword(req, res) {
  await service.changePassword(req.user._id, req.validated.body);
  clearAuthCookies(res);
  res.json({ success: true, data: null });
}