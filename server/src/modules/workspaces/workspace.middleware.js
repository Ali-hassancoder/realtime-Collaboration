import { AppError } from '../../utils/AppError.js';
import { can } from './workspace.permissions.js';
import { findMembership } from './workspace.access.js';

// Loads the caller's membership. Non-members get 404 so IDs can't be probed.
export async function loadMembership(req, _res, next) {
  const membership = await findMembership(req.params.workspaceId, req.user._id);
  if (!membership) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');

  req.membership = membership;
  next();
}

export const requirePermission = (action) => (req, _res, next) => {
  if (!can(req.membership.role, action)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
  }
  next();
};