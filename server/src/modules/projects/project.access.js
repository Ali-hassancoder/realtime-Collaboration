import { isObjectId } from '../workspaces/workspace.access.js';
import { isProjectScoped } from '../workspaces/workspace.permissions.js';
import { Project } from './project.model.js';
import { ProjectMember } from './projectMember.model.js';

// Returns the project if this member may see it, otherwise null. Used by both REST and Socket.IO.
// Matching on workspaceId means a project from another workspace never resolves;
// guests only get projects they were added to.
export async function findAccessibleProject(membership, userId, projectId) {
  if (!isObjectId(projectId)) return null;

  const project = await Project.findOne({ _id: projectId, workspaceId: membership.workspaceId });
  if (!project) return null;

  if (isProjectScoped(membership.role)) {
    const assigned = await ProjectMember.exists({ projectId: project._id, userId });
    if (!assigned) return null;
  }
  return project;
}