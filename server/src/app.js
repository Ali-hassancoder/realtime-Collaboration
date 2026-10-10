import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'API is running' });
  });

  // Feature routers will be mounted here in later phases

  app.use(notFound);
  app.use(errorHandler);

  return app;
}