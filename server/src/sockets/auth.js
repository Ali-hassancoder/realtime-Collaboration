import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { readCookie } from '../utils/cookies.js';
import { User } from '../modules/users/users.model.js';

// Socket.IO delivers err.message and err.data to the client's connect_error handler
export function handshakeError(code, message) {
  const err = new Error(message);
  err.data = { code };
  return err;
}

// Same cookie and same JWT checks as the REST authenticate middleware
export async function authenticateSocket(socket, next) {
  try {
    const token = readCookie(socket.handshake.headers.cookie, 'access_token');
    if (!token) return next(handshakeError('UNAUTHENTICATED', 'Authentication required.'));

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    } catch {
      return next(handshakeError('TOKEN_INVALID', 'Session expired or invalid.'));
    }

    // Loading the user means a deleted account cannot connect
    const user = await User.findById(payload.sub).select('_id');
    if (!user) return next(handshakeError('UNAUTHENTICATED', 'Authentication required.'));

    socket.data.userId = user.id;
    socket.data.expiresAt = payload.exp * 1000;
    return next();
  } catch (err) {
    logger.error({ err }, 'Socket authentication failed unexpectedly');
    return next(handshakeError('INTERNAL_SERVER_ERROR', 'Something went wrong.'));
  }
}