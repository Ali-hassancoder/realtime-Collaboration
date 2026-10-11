import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticates.js';
import { loginLimiter, registerLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import * as controller from './auth.controller.js';

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', refreshLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

export default router;