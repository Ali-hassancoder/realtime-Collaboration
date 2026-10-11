import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { updateProfileSchema, changePasswordSchema } from './users.validation.js';
import * as c from './users.controller.js';

const router = Router();
router.use(authenticate);

router.patch('/me', validate({ body: updateProfileSchema }), c.updateMe);
// Reuses the login limiter: this endpoint also checks a password
router.post('/me/password', loginLimiter, validate({ body: changePasswordSchema }), c.changePassword);

export default router;