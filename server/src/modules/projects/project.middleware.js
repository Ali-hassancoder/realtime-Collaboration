import { AppError } from '../../utils/AppError.js';
import { isProjectScoped } from '../workspaces/workspace.permissions.js';
import { Project } from './project.model.js';
import { ProjectMember } from './projectMember.model.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Requires loadMembership to have run first (req.membership, req.user).
// Every failure is a 404 so project IDs can't be probed.
export async function loadProject(req, _res, next) {
  const { projectId } = req.params;
  const notFound = new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  if (!OBJECT_ID.test(projectId)) throw notFound;

  // Matching on workspaceId as well means a project from another workspace never resolves
  const project = await Project.findOne({ _id: projectId, workspaceId: req.membership.workspaceId });
  if (!project) throw notFound;

  if (isProjectScoped(req.membership.role)) {
    const assigned = await ProjectMember.exists({ projectId: project._id, userId: req.user._id });
    if (!assigned) throw notFound;
  }

  req.project = project;
  next();
}