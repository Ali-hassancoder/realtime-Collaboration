import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'API is running' });
  });

  app.use('/api/auth', authRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}