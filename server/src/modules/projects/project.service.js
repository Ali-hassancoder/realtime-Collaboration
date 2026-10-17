import { AppError } from '../../utils/AppError.js';
import { WorkspaceMember } from '../workspaces/workspaceMember.model.js';
import { isProjectScoped } from '../workspaces/workspace.permissions.js';
import { Project } from './project.model.js';
import { ProjectMember } from './projectMember.model.js';
import { Task } from '../task/task.model.js';
import { Comment } from '../comment/comment.model.js';
import { Message } from '../message/message.model.js';
import { Activity } from '../activity/activity.model.js';
import { Notification } from '../notification/notification.model.js';
import { unassignUser } from '../task/task.cleanup.js';
import { closeProject, syncUserAccess } from '../../sockets/realtime.js';

export async function listProjects(membership, { status, page, limit }) {
  const filter = { workspaceId: membership.workspaceId, status };

  if (isProjectScoped(membership.role)) {
    // Guests only see projects they were added to (capped; a guest on 1000+ projects is not a real case)
    const assigned = await ProjectMember.find({
      workspaceId: membership.workspaceId,
      userId: membership.userId,
    })
      .select('projectId')
      .limit(1000);
    filter._id = { $in: assigned.map((a) => a.projectId) };
  }

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Project.countDocuments(filter),
  ]);
  return { projects, total, page, limit };
}

export async function createProject(membership, user, { name, description }) {
  const project = await Project.create({
    workspaceId: membership.workspaceId,
    name,
    description,
    createdBy: user._id,
  });
  try {
    await ProjectMember.create({
      workspaceId: membership.workspaceId,
      projectId: project._id,
      userId: user._id,
      addedBy: user._id,
    });
  } catch (err) {
    // No transactions on a standalone MongoDB, so compensate manually
    await Project.deleteOne({ _id: project._id });
    throw err;
  }
  return project;
}

export async function updateProject(project, changes) {
  project.set(changes);
  await project.save();
  return project;
}

export async function deleteProject(project) {
  // Project first: orphaned children are unreachable, a half-deleted project is not
  await Project.deleteOne({ _id: project._id });
  await ProjectMember.deleteMany({ projectId: project._id });
  await Promise.all([
    Task.deleteMany({ projectId: project._id }),
    Comment.deleteMany({ projectId: project._id }),
    Message.deleteMany({ projectId: project._id }),
    Activity.deleteMany({ projectId: project._id }),
    Notification.deleteMany({ projectId: project._id }),
  ]);
  closeProject(project.workspaceId, project._id);
}

export async function listProjectMembers(project) {
  const links = await ProjectMember.find({ projectId: project._id })
    .populate('userId', 'name email')
    .sort({ createdAt: 1 })
    .limit(200);
  const valid = links.filter((l) => l.userId);

  const roles = await WorkspaceMember.find({
    workspaceId: project.workspaceId,
    userId: { $in: valid.map((l) => l.userId._id) },
  }).select('userId role');
  const roleByUser = new Map(roles.map((r) => [r.userId.toString(), r.role]));

  return valid.map((l) => ({
    userId: l.userId.id,
    name: l.userId.name,
    email: l.userId.email,
    workspaceRole: roleByUser.get(l.userId.id) ?? null,
    addedAt: l.createdAt,
  }));
}

export async function addProjectMember(actor, project, userId) {
  // Only people already in the workspace can join one of its projects
  const inWorkspace = await WorkspaceMember.exists({ workspaceId: project.workspaceId, userId });
  if (!inWorkspace) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'That person is not a member of this workspace.');
  }
  try {
    await ProjectMember.create({
      workspaceId: project.workspaceId,
      projectId: project._id,
      userId,
      addedBy: actor.userId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, 'ALREADY_PROJECT_MEMBER', 'This person is already on the project.');
    }
    throw err;
  }
  return { userId };
}

export async function removeProjectMember(project, userId) {
  await unassignUser({ projectId: project._id }, userId);
  const result = await ProjectMember.deleteOne({ projectId: project._id, userId });
  if (result.deletedCount === 0) {
    throw new AppError(404, 'PROJECT_MEMBER_NOT_FOUND', 'That person is not on this project.');
  }
  // A guest loses live access to the project's room
  await syncUserAccess(userId, project.workspaceId);
}