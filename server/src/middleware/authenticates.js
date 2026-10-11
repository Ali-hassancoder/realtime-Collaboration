import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../modules/users/user.model.js';

export async function authenticate(req, _res, next) {
  const token = req.cookies?.access_token;
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'TOKEN_INVALID', 'Session expired or invalid.');
  }

  // Loading the user means a deleted account loses access immediately
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');

  req.user = user;
  next();
}