import { AppError } from '../../utils/AppError.js';
import { findAccessibleProject } from './project.access.js';

// Requires loadMembership to have run first (req.membership, req.user).
// Every failure is a 404 so project IDs can't be probed.
export async function loadProject(req, _res, next) {
  const project = await findAccessibleProject(req.membership, req.user._id, req.params.projectId);
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');

  req.project = project;
  next();
}