import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { inviteLimiter } from '../../middleware/rateLimit.js';
import { loadMembership, requirePermission } from './workspace.middleware.js';
import projectRoutes from '../projects/project.routes.js';
import * as v from './workspace.validation.js';
import * as c from './workspace.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', c.list);
router.post('/', validate({ body: v.createWorkspaceSchema }), c.create);

router.get('/:workspaceId', loadMembership, c.get);
router.patch('/:workspaceId', loadMembership, requirePermission('workspace:update'), validate({ body: v.updateWorkspaceSchema }), c.update);
router.delete('/:workspaceId', loadMembership, requirePermission('workspace:delete'), c.remove);

router.get('/:workspaceId/members', loadMembership, requirePermission('member:read'), c.listMembers);
router.patch('/:workspaceId/members/:userId', loadMembership, validate({ params: v.memberParams, body: v.updateRoleSchema }), c.updateMemberRole);
router.delete('/:workspaceId/members/:userId', loadMembership, validate({ params: v.memberParams }), c.removeMember);

router.get('/:workspaceId/invites', loadMembership, requirePermission('member:invite'), c.listInvites);
router.post('/:workspaceId/invites', inviteLimiter, loadMembership, requirePermission('member:invite'), validate({ body: v.inviteSchema }), c.createInvite);
router.delete('/:workspaceId/invites/:inviteId', loadMembership, requirePermission('member:invite'), validate({ params: v.inviteParams }), c.deleteInvite);

// Projects: membership is resolved first, so every project route knows the caller's role
router.use('/:workspaceId/projects', loadMembership, projectRoutes);

export default router;