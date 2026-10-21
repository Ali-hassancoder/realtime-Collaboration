import { logger } from '../utils/logger.js';

// Extracted from server.js so the drain-then-force behaviour is testable without booting the
// real app (which would need a live Mongo). Two-phase shutdown:
// 1. orderly: close socket.io + http, await in-flight requests, disconnect the DB, exit 0;
// 2. deadline: if connections linger (keep-alive, upgraded websockets), force-close everything
//    and exit anyway - a hung drain must never outrun the platform's SIGKILL.
export function createShutdownHandler({ io, httpServer, disconnectDB, exit, forceMs = 8_000 }) {
  let started = false;
  let deadline;

  return function shutdown(signal) {
    if (started) return; // repeat signals (docker stop escalates SIGTERM -> SIGINT) must not re-enter
    started = true;
    logger.info({ signal }, 'Shutting down');

    deadline = setTimeout(() => {
      logger.warn('Shutdown deadline reached, forcing connection close');
      io.disconnectSockets(true);
      httpServer.closeAllConnections?.();
      exit(0);
    }, forceMs);
    deadline.unref?.();

    io.close(); // also closes the websocket upgrade agent
    httpServer.close(async () => {
      clearTimeout(deadline);
      await disconnectDB();
      exit(0);
    });
  };
}
