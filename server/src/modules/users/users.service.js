import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword, revokeAllSessions } from '../auth/auth.service.js';
import { User } from './users.model.js';

export async function updateProfile(user, { name }) {
  user.name = name;
  await user.save();
  return user;
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  // 400, not 401: a 401 would trigger the client's refresh-and-retry flow
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(userId); // every device must log in again
}