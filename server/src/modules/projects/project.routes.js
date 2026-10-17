import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requirePermission } from '../workspaces/workspace.middleware.js';
import { loadProject } from './project.middleware.js';
import taskRoutes from '../task/task.routes.js';
import messageRoutes from '../message/message.routes.js';
import activityRoutes from '../activity/activity.routes.js';
import * as v from './project.validation.js';
import * as c from './project.controller.js';

// Mounted at /api/workspaces/:workspaceId/projects, after authenticate + loadMembership
const router = Router({ mergeParams: true });

router.get('/', requirePermission('project:read'), validate({ query: v.listProjectsQuery }), c.list);
router.post('/', requirePermission('project:create'), validate({ body: v.createProjectSchema }), c.create);

router.get('/:projectId', requirePermission('project:read'), loadProject, c.get);
router.patch('/:projectId', requirePermission('project:update'), loadProject, validate({ body: v.updateProjectSchema }), c.update);
router.delete('/:projectId', requirePermission('project:delete'), loadProject, c.remove);

router.get('/:projectId/members', requirePermission('project:read'), loadProject, c.listMembers);
router.post('/:projectId/members', requirePermission('project:manage_members'), loadProject, validate({ body: v.addProjectMemberSchema }), c.addMember);
router.delete('/:projectId/members/:userId', requirePermission('project:manage_members'), loadProject, validate({ params: v.projectMemberParams }), c.removeMember);

// Tasks: the project is resolved first (including guest scoping); each task route then checks its own permission
router.use('/:projectId/tasks', loadProject, taskRoutes);

// Chat and the activity feed: the project is resolved first (including guest scoping)
router.use('/:projectId/messages', loadProject, messageRoutes);
router.use('/:projectId/activity', loadProject, activityRoutes);

export default router;