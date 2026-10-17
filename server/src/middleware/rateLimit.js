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
