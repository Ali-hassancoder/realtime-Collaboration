import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const isMalformedJson = err.type === 'entity.parse.failed';
  const isTooLarge = err.type === 'entity.too.large';

  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.isOperational ? err.message : 'Something went wrong.';

  if (isMalformedJson) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Request body contains invalid JSON.';
  } else if (isTooLarge) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  }

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
  } else {
    logger.warn({ code, path: req.originalUrl, method: req.method }, message);
  }

  const body = { success: false, error: { code, message } };
  // Stack traces only in development, never in production
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}