import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { hashToken } from '../auth/auth.service.js';
import { User } from '../users/users.model.js';
import { Workspace } from './workspace.model.js';
import { WorkspaceMember } from './workspaceMember.model.js';
import { WorkspaceInvite } from './workspaceInvite.model.js';
import { Project } from '../projects/project.model.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { Task } from '../task/task.model.js';
import { Comment } from '../comment/comment.model.js';
import { Message } from '../message/message.model.js';
import { Activity } from '../activity/activity.model.js';
import { Notification } from '../notification/notification.model.js';
import { unassignUser } from '../task/task.cleanup.js';
import { beginWorkspaceClose, syncUserAccess } from '../../sockets/realtime.js';
import { can, outranks, permissionsFor } from './workspace.permissions.js';

const INVITE_DAYS = 7;
const forbidden = (msg = 'You do not have permission to do this.') => new AppError(403, 'FORBIDDEN', msg);

const withRole = (workspace, role) => ({ ...workspace.toJSON(), role, permissions: permissionsFor(role) });

// ---------- Workspaces ----------

export async function createWorkspace(user, { name, description }) {
  const workspace = await Workspace.create({ name, description, ownerId: user._id });
  try {
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: user._id, role: 'owner' });
  } catch (err) {
    // No transactions on a standalone MongoDB, so compensate manually
    await Workspace.deleteOne({ _id: workspace._id });
    throw err;
  }
  return withRole(workspace, 'owner');
}

export async function listWorkspaces(userId) {
  // Capped for now; real pagination arrives when it's needed
  const memberships = await WorkspaceMember.find({ userId }).sort({ createdAt: -1 }).limit(100);
  const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } });
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  return memberships
    .filter((m) => byId.has(m.workspaceId.toString()))
    .map((m) => withRole(byId.get(m.workspaceId.toString()), m.role));
}

export async function getWorkspace(membership) {
  const workspace = await Workspace.findById(membership.workspaceId);
  if (!workspace) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  return withRole(workspace, membership.role);
}

export async function updateWorkspace(membership, changes) {
  const workspace = await Workspace.findByIdAndUpdate(membership.workspaceId, { $set: changes }, { returnDocument: 'after', runValidators: true });
  if (!workspace) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  return withRole(workspace, membership.role);
}

export async function deleteWorkspace(membership) {
  const { workspaceId } = membership;
  // Capture the rooms and members first: the data they come from is deleted below
  const finishClose = await beginWorkspaceClose(workspaceId);

  // Workspace first: orphaned children are unreachable, a half-deleted workspace is not
  await Workspace.deleteOne({ _id: workspaceId });
  await WorkspaceMember.deleteMany({ workspaceId });
  await WorkspaceInvite.deleteMany({ workspaceId });
  await Project.deleteMany({ workspaceId });
  await ProjectMember.deleteMany({ workspaceId });
  await Promise.all([
    Task.deleteMany({ workspaceId }),
    Comment.deleteMany({ workspaceId }),
    Message.deleteMany({ workspaceId }),
    Activity.deleteMany({ workspaceId }),
    Notification.deleteMany({ workspaceId }),
  ]);

  finishClose();
}

// ---------- Members ----------

export async function listMembers(workspaceId) {
  const members = await WorkspaceMember.find({ workspaceId }).populate('userId', 'name email').sort({ createdAt: 1 }).limit(200);
  return members
    .filter((m) => m.userId)
    .map((m) => ({
      userId: m.userId.id,
      name: m.userId.name,
      email: m.userId.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
}

export async function updateMemberRole(actor, targetUserId, newRole) {
  if (!can(actor.role, 'member:update')) throw forbidden();
  const target = await WorkspaceMember.findOne({ workspaceId: actor.workspaceId, userId: targetUserId });
  if (!target) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');

  // Actor must outrank both the target's current role and the role being granted
  if (!outranks(actor.role, target.role) || !outranks(actor.role, newRole)) {
    throw forbidden('You cannot change this member\'s role.');
  }
  target.role = newRole;
  await target.save();
  // A demotion to guest can remove live access to projects they are not on
  await syncUserAccess(targetUserId, actor.workspaceId);
  return { userId: targetUserId, role: newRole };
}

export async function removeMember(actor, targetUserId) {
  if (actor.userId.equals(targetUserId)) {
    if (actor.role === 'owner') {
      throw new AppError(403, 'OWNER_CANNOT_LEAVE', 'The owner cannot leave. Delete the workspace instead.');
    }
    await actor.deleteOne(); // leaving
    await ProjectMember.deleteMany({ workspaceId: actor.workspaceId, userId: actor.userId });
    // A member loses their inbox for this workspace with their access
    await Notification.deleteMany({ recipientId: actor.userId, workspaceId: actor.workspaceId });
    await unassignUser({ workspaceId: actor.workspaceId }, actor.userId);
    await syncUserAccess(actor.userId, actor.workspaceId);
    return;
  }

  const target = await WorkspaceMember.findOne({ workspaceId: actor.workspaceId, userId: targetUserId });
  if (!target) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
  if (!can(actor.role, 'member:remove') || !outranks(actor.role, target.role)) throw forbidden();
  await target.deleteOne();
  await ProjectMember.deleteMany({ workspaceId: target.workspaceId, userId: target.userId });
  // A removed member loses their inbox for this workspace with their access
  await Notification.deleteMany({ recipientId: target.userId, workspaceId: target.workspaceId });
  await unassignUser({ workspaceId: target.workspaceId }, target.userId);
  await syncUserAccess(target.userId, target.workspaceId);
}

// ---------- Invites ----------

export async function createInvite(actor, { email, role }) {
  if (!outranks(actor.role, role)) throw forbidden('You cannot invite someone with that role.');

  const existingUser = await User.findOne({ email }).select('_id');
  if (existingUser && (await WorkspaceMember.exists({ workspaceId: actor.workspaceId, userId: existingUser._id }))) {
    throw new AppError(409, 'ALREADY_MEMBER', 'This person is already a member.');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const invite = await WorkspaceInvite.findOneAndUpdate(
    { workspaceId: actor.workspaceId, email },
    {
      $set: {
        role,
        tokenHash: hashToken(rawToken),
        invitedBy: actor.userId,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  // The raw token is returned once and never stored
  return { invite, inviteUrl: `${env.CLIENT_URL}/invite/${rawToken}` };
}

export async function listInvites(workspaceId) {
  return WorkspaceInvite.find({ workspaceId }).sort({ createdAt: -1 }).limit(100);
}

export async function deleteInvite(workspaceId, inviteId) {
  const result = await WorkspaceInvite.deleteOne({ _id: inviteId, workspaceId });
  if (result.deletedCount === 0) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invitation not found.');
}

export async function acceptInvite(user, rawToken) {
  const invite = await WorkspaceInvite.findOne({ tokenHash: hashToken(rawToken), expiresAt: { $gt: new Date() } });
  if (!invite) throw new AppError(404, 'INVITE_INVALID', 'This invitation is invalid or has expired.');
  if (invite.email !== user.email) {
    throw new AppError(403, 'INVITE_EMAIL_MISMATCH', 'This invitation was sent to a different email address.');
  }

  try {
    await WorkspaceMember.create({ workspaceId: invite.workspaceId, userId: user._id, role: invite.role });
  } catch (err) {
    if (err.code !== 11000) throw err; // already a member: fine, still consume the invite
  }
  await WorkspaceInvite.deleteOne({ _id: invite._id });

  const membership = await WorkspaceMember.findOne({ workspaceId: invite.workspaceId, userId: user._id });
  // invitedBy travels back so the controller can notify the person who sent the invite
  return { workspace: await getWorkspace(membership), invitedBy: invite.invitedBy };
}