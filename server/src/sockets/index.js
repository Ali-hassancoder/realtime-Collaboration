import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { authenticateSocket, handshakeError } from './auth.js';
import { createEventLimiter, createKeyedLimiter } from './limits.js';
import { setIo } from './realtime.js';
import { joinRoom, leaveRoom } from './roomhandler.js';
import { clearPresence } from './presence.js';
import { typingStarted, typingStopped } from './typingevents.js';
import { docSubscribe, docUnsubscribe, docUpdate, cleanupSocketDocs } from './documentevents.js';
import { userRoom } from './rooms.js';

const MAX_MESSAGE_BYTES = 256 * 1024; // 256 KB: covers Yjs sync payloads for the Project Notes doc
// (Phase 13) while keeping an upper bound. Regular text traffic stays well under this.
const MAX_SOCKETS_PER_USER = 10;
const EVENT_RATE = { limit: 60, windowMs: 10_000 };
const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout cannot wait longer than this

// (Phase 15) Per-IP cap on handshake attempts. A legitimate browser handshakes once per
// token refresh (~15 min), so 30/min is generous even behind a busy NAT; it exists to stop
// unauthenticated floods from reaching the JWT check and the user lookup in the DB.
// Skipped in tests, like the REST limiters (the suites open many sockets from one IP).
const HANDSHAKE_RATE = { limit: 30, windowMs: 60_000 };

const failure = (code, message) => ({ ok: false, error: { code, message } });

export function initSocket(httpServer) {
  const clientOrigin = new URL(env.CLIENT_URL).origin;
  const openSockets = new Map(); // userId -> open sockets in this process

  const io = new Server(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    // Same TRUST_PROXY switch as REST: when set, Socket.IO parses X-Forwarded-For so
    // handshake.address (and therefore the per-IP guard below) sees the real client.
    proxy: Boolean(env.TRUST_PROXY),
    // Browsers always send Origin on WebSocket handshakes. If it is present it must be ours,
    // otherwise another site could ride the user's cookie (cross-site WebSocket hijacking).
    allowRequest: (req, callback) => {
      const { origin } = req.headers;
      callback(null, !origin || origin === clientOrigin);
    },
  });

  if (env.NODE_ENV !== 'test') {
    const handshakeAllowed = createKeyedLimiter(HANDSHAKE_RATE);
    setInterval(() => handshakeAllowed.sweep(), HANDSHAKE_RATE.windowMs).unref();
    io.use((socket, next) => {
      if (handshakeAllowed(socket.handshake.address) === 'limited') {
        return next(handshakeError('RATE_LIMITED', 'Too many connection attempts. Slow down.'));
      }
      return next();
    });
  }

  io.use(authenticateSocket);
  io.use((socket, next) => {
    if ((openSockets.get(socket.data.userId) ?? 0) >= MAX_SOCKETS_PER_USER) {
      return next(handshakeError('TOO_MANY_CONNECTIONS', 'Too many open connections.'));
    }
    return next();
  });

  io.on('connection', (socket) => {
    const { userId, expiresAt } = socket.data;
    openSockets.set(userId, (openSockets.get(userId) ?? 0) + 1);
    socket.join(userRoom(userId));
    logger.info({ socketId: socket.id, userId }, 'Socket connected');

    // End the connection when the access token expires (the same window REST enforces).
    // The client refreshes its session over REST and reconnects.
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS)
    );
    expiryTimer.unref();

    // Counts every incoming packet, including unknown events
    const allow = createEventLimiter(EVENT_RATE);
    socket.on('error', (err) => logger.debug({ socketId: socket.id, err: err.message }, 'Socket packet rejected'));
    socket.use((packet, next) => {
      const verdict = allow();
      if (verdict === 'ok') return next();

      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack(failure('RATE_LIMITED', 'Too many events. Slow down.'));
      if (verdict === 'abusive') {
        logger.warn({ socketId: socket.id, userId }, 'Disconnecting socket for event spam');
        socket.disconnect(true);
      }
      return next(new Error('rate_limited'));
    });

    // Handlers run one at a time per socket, so a quick join + leave can never be reordered
    let queue = Promise.resolve();
    const handle = (event, fn) => {
      socket.on(event, (...args) => {
        const ack = typeof args.at(-1) === 'function' ? args.pop() : null;
        const reply = (response) => {
          if (ack) ack(response);
        };
        const payload = args[0];

        queue = queue.then(async () => {
          if (socket.disconnected) return;
          try {
            reply({ ok: true, data: await fn(socket, payload) });
          } catch (err) {
            if (err instanceof AppError) {
              reply(failure(err.code, err.message));
              return;
            }
            logger.error({ err, event }, 'Unhandled socket handler error');
            reply(failure('INTERNAL_SERVER_ERROR', 'Something went wrong.'));
          }
        });
      });
    };

    handle('room.join', joinRoom);
    handle('room.leave', leaveRoom);
    handle('typing.started', typingStarted);
    handle('typing.stopped', typingStopped);
    handle('doc.subscribe', docSubscribe);
    handle('doc.unsubscribe', docUnsubscribe);
    handle('doc.update', docUpdate);

    socket.on('disconnect', (reason) => {
      clearTimeout(expiryTimer);
      clearPresence(socket);
      cleanupSocketDocs(socket);
      const remaining = (openSockets.get(userId) ?? 1) - 1;
      if (remaining <= 0) openSockets.delete(userId);
      else openSockets.set(userId, remaining);
      logger.info({ socketId: socket.id, userId, reason }, 'Socket disconnected');
    });
  });

  setIo(io);
  return io;
}