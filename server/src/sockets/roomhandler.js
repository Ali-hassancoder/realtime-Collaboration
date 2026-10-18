import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { can } from '../modules/workspaces/workspace.permissions.js';
import { findMembership } from '../modules/workspaces/workspace.access.js';
import { findAccessibleProject } from '../modules/projects/project.access.js';
import { projectRoom, workspaceRoom } from './rooms.js';
import { addPresence, leavePresence } from './presence.js';

const MAX_ROOMS_PER_SOCKET = 50;

// Lowercased so a client cannot create look-alike rooms with different letter case
const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id')
  .transform((s) => s.toLowerCase());

// Only these two room types can be requested. The personal user room is never client-controlled.
const joinSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace'), workspaceId: objectId }),
  z.object({ type: z.literal('project'), workspaceId: objectId, projectId: objectId }),
]);

const leaveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace'), workspaceId: objectId }),
  z.object({ type: z.literal('project'), projectId: objectId }),
]);

const openRoomCount = (socket) =>
  [...socket.rooms].filter((room) => room.startsWith('workspace:') || room.startsWith('project:')).length;

// Same checks, same error codes and the same "everything inaccessible is not found" as the REST middleware.
// Returns the canonical room name, built from the database documents rather than from client input.
async function authorize(userId, target) {
  const membership = await findMembership(target.workspaceId, userId);
  if (!membership || !can(membership.role, 'workspace:read')) {
    throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  }
  if (target.type === 'workspace') return workspaceRoom(membership.workspaceId.toString());

  if (!can(membership.role, 'project:read')) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
  }
  const project = await findAccessibleProject(membership, userId, target.projectId);
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return projectRoom(project._id.toString());
}

export async function joinRoom(socket, payload) {
  const parsed = joinSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid room request.');

  const target = parsed.data;
  const { userId } = socket.data;

  const room = await authorize(userId, target);
  if (!socket.rooms.has(room) && openRoomCount(socket) >= MAX_ROOMS_PER_SOCKET) {
    throw new AppError(429, 'TOO_MANY_ROOMS', 'Too many open rooms.');
  }

  await socket.join(room);

  // Access may have been revoked between the check above and the join. Checking again after
  // joining closes that gap: a revocation after this point will find the socket in the room.
  try {
    await authorize(userId, target);
  } catch (err) {
    await socket.leave(room);
    throw err;
  }

  // Presence (Phase 12) is project-scoped and starts only once the join is confirmed durable.
  if (target.type === 'project') addPresence(socket, target.projectId);
  return { room };
}

// Leaving needs no authorization, but the payload is still validated and the target is restricted
// to workspace/project rooms, so the personal room cannot be left.
export async function leaveRoom(socket, payload) {
  const parsed = leaveSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid room request.');

  const target = parsed.data;
  if (target.type === 'project') leavePresence(socket, target.projectId);
  await socket.leave(target.type === 'workspace' ? workspaceRoom(target.workspaceId) : projectRoom(target.projectId));
  return {};
}