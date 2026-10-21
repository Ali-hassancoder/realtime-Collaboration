import 'dotenv/config';
import http from 'node:http';
import { env } from './config/env.js';
import { assertRuntimeConfig } from './config/runtimeGuard.js';
import { createShutdownHandler } from './config/shutdown.js';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './sockets/index.js';
import { logger } from './utils/logger.js';

const FORCE_EXIT_MS = 8_000; // platforms typically SIGKILL after ~10-30s; stop long before that

// Production traps: a crash must be one readable log line, not a silent exit or a process
// limping on broken internal state. Node's default unhandled-rejection mode would kill the
// process without this shape of log; the container platform restarts us.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection, exiting');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception, exiting');
  process.exit(1);
});

async function start() {
  assertRuntimeConfig(env); // fail fast before the DB connection or any port is opened
  await connectDB(env.MONGO_URI);

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });

  const shutdown = createShutdownHandler({
    io,
    httpServer,
    disconnectDB,
    exit: (code) => process.exit(code),
    forceMs: FORCE_EXIT_MS,
  });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
