import { logger } from '../utils/logger.js';
import { isProjectScoped } from '../modules/workspaces/workspace.permissions.js';
import { WorkspaceMember } from '../modules/workspaces/workspaceMember.model.js';
import { Project } from '../modules/projects/project.model.js';
import { ProjectMember } from '../modules/projects/projectMember.model.js';
import { projectRoom, userRoom, workspaceRoom } from './rooms.js';

let io = null;
export const setIo = (instance) => {
  io = instance;
};

// Fire-and-forget broadcast used by REST handlers to publish changes (Phase 8 task events).
// A no-op until the socket server is initialised, so REST-only contexts stay unaffected.
export function emitToRoom(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

// Targeted single-socket delivery (a joining client's first presence roster).
export function emitToSocket(socketId, event, payload) {
  if (!io) return;
  io.to(socketId).emit(event, payload);
}

// Broadcast to a room minus one socket (typing relays exclude the sender).
export function emitToRoomExcept(room, exceptSocketId, event, payload) {
  if (!io) return;
  io.to(room).except(exceptSocketId).emit(event, payload);
}

// Presence (Phase 12) registers a cleanup callback here so that when a project or workspace is
// closed its in-memory roster is dropped. Kept as a hook list to avoid a realtime <-> presence
// import cycle: presence imports realtime, never the other way around.
const roomCloseHandlers = new Set();
export const onRoomClosed = (fn) => {
  roomCloseHandlers.add(fn);
  return () => roomCloseHandlers.delete(fn);
};
const notifyRoomClosed = (projectId) => {
  for (const fn of roomCloseHandlers) {
    try {
      fn(projectId);
    } catch (err) {
      logger.error({ err }, 'Room-close handler failed');
    }
  }
};

// Safety cap on how many projects one workspace revocation will scan
const MAX_PROJECTS_SCANNED = 5000;

async function projectIdsOf(workspaceId) {
  const projects = await Project.find({ workspaceId }).select('_id').limit(MAX_PROJECTS_SCANNED).lean();
  return projects.map((p) => p._id.toString());
}

// Re-derives from the database which rooms this user may still be in for a workspace, removes their
// sockets from the rest, and tells them to refetch. Call after anything that changes their access:
// removal, leaving, a role change, or removal from a project team.
export async function syncUserAccess(userId, workspaceId) {
  if (!io) return;
  try {
    const uid = String(userId);
    const wid = String(workspaceId);

    const membership = await WorkspaceMember.findOne({ workspaceId: wid, userId: uid }).select('role').lean();
    const projectIds = await projectIdsOf(wid);

    let leave = [];
    if (!membership) {
      leave = [workspaceRoom(wid), ...projectIds.map((id) => projectRoom(id))];
    } else if (isProjectScoped(membership.role)) {
      const assigned = await ProjectMember.find({ workspaceId: wid, userId: uid }).select('projectId').lean();
      const allowed = new Set(assigned.map((a) => a.projectId.toString()));
      leave = projectIds.filter((id) => !allowed.has(id)).map((id) => projectRoom(id));
    }

    const target = io.in(userRoom(uid));
    if (leave.length > 0) target.socketsLeave(leave);
    target.emit('access.changed', { workspaceId: wid });
  } catch (err) {
    logger.error({ err }, 'Failed to sync socket rooms after an access change');
  }
}

// The room is closed after the project is deleted; everyone in it is told, then removed
export function closeProject(workspaceId, projectId) {
  if (!io) return;
  const room = projectRoom(String(projectId));
  io.in(room).emit('access.changed', { workspaceId: String(workspaceId) });
  io.in(room).socketsLeave(room);
  notifyRoomClosed(String(projectId));
}

// Deleting a workspace removes its projects, so the room list and member list are captured first.
// Usage: const finishClose = await beginWorkspaceClose(id); ...delete data...; finishClose();
export async function beginWorkspaceClose(workspaceId) {
  if (!io) return () => {};
  const wid = String(workspaceId);

  let rooms = [workspaceRoom(wid)];
  let projectIds = [];
  let memberRooms = [];
  try {
    projectIds = await projectIdsOf(wid);
    rooms = [...rooms, ...projectIds.map((id) => projectRoom(id))];
    const members = await WorkspaceMember.find({ workspaceId: wid }).select('userId').limit(1000).lean();
    memberRooms = members.map((m) => userRoom(m.userId.toString()));
  } catch (err) {
    logger.error({ err }, 'Failed to collect rooms before closing a workspace');
  }

  return () => {
    // An empty room list would target every connected socket, so it is guarded
    if (memberRooms.length > 0) io.in(memberRooms).emit('access.changed', { workspaceId: wid });
    io.in(rooms).socketsLeave(rooms);
    for (const id of projectIds) notifyRoomClosed(id);
  };
}