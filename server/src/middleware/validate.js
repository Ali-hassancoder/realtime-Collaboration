import { AppError } from '../utils/AppError.js';

// Usage: validate({ body: schema, query: schema, params: schema })
// Parsed, sanitized data is placed on req.validated (never trust raw req.body).
export const validate = (schemas) => (req, _res, next) => {
  req.validated = {};
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request data.', details));
    }
    req.validated[key] = result.data;
  }
  next();
};