import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import * as v from './activity.validation.js';
import * as c from './activity.controller.js';

// Mounted at .../projects/:projectId/activity, after the project and membership are resolved
const router = Router({ mergeParams: true });

router.get('/', requirePermission('project:read'), validate({ query: v.listActivityQuery }), c.list);

export default router;
