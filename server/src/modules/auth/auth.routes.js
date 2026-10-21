import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  emailLinkLimiter,
  resendVerificationLimiter,
} from '../../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';
import * as controller from './auth.controller.js';

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', refreshLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

// Phase 16: email verification + password reset. Tokens travel in POST bodies; the
// emailed links are client routes (/verify-email/:token, /reset-password/:token) that
// forward the token here - same shape as the workspace invite accept flow.
router.post('/verify-email', emailLinkLimiter, validate({ body: verifyEmailSchema }), controller.verifyEmail);
router.post('/resend-verification', authenticate, resendVerificationLimiter, controller.resendVerification);
router.post('/forgot-password', emailLinkLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', emailLinkLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);

export default router;