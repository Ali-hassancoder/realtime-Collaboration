import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import { loadMessage } from './message.middleware.js';
import * as v from './message.validation.js';
import * as c from './message.controller.js';

// Mounted at .../projects/:projectId/messages, after the project and membership are resolved
// by the parents. resolveProject makes a message from another project unreachable.
const router = Router({ mergeParams: true });

router.get('/', requirePermission('message:read'), validate({ query: v.listMessagesQuery }), c.list);
router.post('/', requirePermission('message:create'), validate({ body: v.createMessageSchema }), c.create);

router.patch(
  '/:messageId',
  requirePermission('message:edit_own'),
  loadMessage,
  validate({ params: v.messageParams, body: v.updateMessageSchema }),
  c.update
);
router.delete('/:messageId', requirePermission('message:delete_own'), loadMessage, validate({ params: v.messageParams }), c.remove);

export default router;
