import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const make = (options) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.')),
    ...options,
  });

// Counts only failed logins, so normal use is not penalized
export const loginLimiter = make({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });
export const registerLimiter = make({ windowMs: 60 * 60 * 1000, limit: 10 });
export const refreshLimiter = make({ windowMs: 15 * 60 * 1000, limit: 60 });
export const inviteLimiter = make({ windowMs: 60 * 60 * 1000, limit: 30 });

// Task writes (create/edit/move/delete) are the highest-volume mutating endpoints, so a single
// client - scripted or a runaway browser - cannot hammer them. Every task route sits behind
// authenticate, so the key is always the authenticated user (never a bare IP, which also keeps
// IPv6 clients from collapsing into one bucket). The limit is generous for normal board use.
export const writeLimiter = make({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
});
