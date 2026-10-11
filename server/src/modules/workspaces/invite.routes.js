import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { inviteLimiter } from '../../middleware/rateLimit.js';
import { acceptInviteSchema } from './workspace.validation.js';
import { acceptInvite } from './workspace.controller.js';

const router = Router();
router.post('/accept', authenticate, inviteLimiter, validate({ body: acceptInviteSchema }), acceptInvite);
export default router;