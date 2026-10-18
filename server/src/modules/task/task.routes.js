import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import { loadTask } from './task.middleware.js';
import commentRoutes from '../comment/comment.routes.js';
import * as v from './task.validation.js';
import * as c from './task.controller.js';

// Mounted at .../projects/:projectId/tasks, after authenticate + loadMembership + loadProject
const router = Router({ mergeParams: true });

// '/board' must be declared before '/:taskId'
router.get('/board', requirePermission('task:read'), validate({ query: v.boardQuery }), c.board);
router.post('/', writeLimiter, requirePermission('task:create'), validate({ body: v.createTaskSchema }), c.create);

router.get('/:taskId', requirePermission('task:read'), loadTask, c.get);
router.patch('/:taskId', writeLimiter, requirePermission('task:update'), loadTask, validate({ body: v.updateTaskSchema }), c.update);
router.post('/:taskId/move', writeLimiter, requirePermission('task:update'), loadTask, validate({ body: v.moveTaskSchema }), c.move);
router.delete('/:taskId', writeLimiter, requirePermission('task:delete'), loadTask, c.remove);

// Comments: the task is resolved first, then each comment route checks its own permission
router.use('/:taskId/comments', commentRoutes);

export default router;