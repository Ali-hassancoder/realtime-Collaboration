import { AppError } from '../../utils/AppError.js';
import { WorkspaceMember } from './workspaceMember.model.js';
import { can } from './workspace.permissions.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Loads the caller's membership. Non-members get 404 so IDs can't be probed.
export async function loadMembership(req, _res, next) {
  const { workspaceId } = req.params;
  const notFound = new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  if (!OBJECT_ID.test(workspaceId)) throw notFound;

  const membership = await WorkspaceMember.findOne({ workspaceId, userId: req.user._id });
  if (!membership) throw notFound;

  req.membership = membership;
  next();
}

export const requirePermission = (action) => (req, _res, next) => {
  if (!can(req.membership.role, action)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
  }
  next();
};