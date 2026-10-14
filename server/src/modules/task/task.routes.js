import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import { loadTask } from './task.middleware.js';
import * as v from './task.validation.js';
import * as c from './task.controller.js';

// Mounted at .../projects/:projectId/tasks, after authenticate + loadMembership + loadProject
const router = Router({ mergeParams: true });

// '/board' must be declared before '/:taskId'
router.get('/board', requirePermission('task:read'), validate({ query: v.boardQuery }), c.board);
router.post('/', requirePermission('task:create'), validate({ body: v.createTaskSchema }), c.create);

router.get('/:taskId', requirePermission('task:read'), loadTask, c.get);
router.patch('/:taskId', requirePermission('task:update'), loadTask, validate({ body: v.updateTaskSchema }), c.update);
router.post('/:taskId/move', requirePermission('task:update'), loadTask, validate({ body: v.moveTaskSchema }), c.move);
router.delete('/:taskId', requirePermission('task:delete'), loadTask, c.remove);

export default router;