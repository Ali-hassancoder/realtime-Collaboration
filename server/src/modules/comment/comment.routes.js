import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import { loadTask } from '../task/task.middleware.js';
import { loadComment } from './comment.middleware.js';
import * as v from './comment.validation.js';
import * as c from './comment.controller.js';

// Mounted at .../projects/:projectId/tasks/:taskId/comments, after the project and membership
// are resolved by the parents. resolveTask makes a comment from another task unreachable.
const router = Router({ mergeParams: true });
router.use(loadTask);

router.get('/', requirePermission('task:read'), validate({ query: v.listCommentsQuery }), c.list);
router.post('/', requirePermission('comment:create'), validate({ body: v.createCommentSchema }), c.create);

router.patch(
  '/:commentId',
  requirePermission('comment:edit_own'),
  loadComment,
  validate({ params: v.commentParams, body: v.updateCommentSchema }),
  c.update
);
router.delete('/:commentId', requirePermission('comment:delete_own'), loadComment, validate({ params: v.commentParams }), c.remove);

export default router;
