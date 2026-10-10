import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initSocket } from './sockets/index.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB(process.env.MONGO_URI);

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    io.close();
    httpServer.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});