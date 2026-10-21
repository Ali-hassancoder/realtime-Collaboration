import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import workspaceRoutes from './modules/workspaces/workspace.routes.js';
import inviteRoutes from './modules/workspaces/invite.routes.js';
import notificationRoutes from './modules/notification/notification.routes.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy the socket connection appears to come from the proxy; trusting the
  // configured number of hops makes req.ip (and therefore per-IP rate limiting) see the client.
  // Off by default so a directly-exposed app cannot be spoofed by an X-Forwarded-For header.
  if (env.TRUST_PROXY) {
    const hops = Number(env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : env.TRUST_PROXY === 'true');
  }

  // API-only service: it never renders HTML, so the default CSP would only reject our own
  // error pages tooling; frameguard/noSniff still matter because browsers visit these routes.
  // HSTS is enabled explicitly (helmet's default 180 s is too short to survive a redirect hop)
  // and only fires on https origins, so setting it locally is harmless.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: { maxAge: 31_536_000, includeSubDomains: true }, // 1 year
    }),
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // Platform health checks poll this; keep it dependency-free (no DB read) so a slow Atlas
  // connection never flakes the probe. uptime/version help deploy log diffing.
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'API is running', uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}