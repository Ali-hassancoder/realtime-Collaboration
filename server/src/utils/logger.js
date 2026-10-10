import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  // Never log secrets or credentials
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token'],
});