import { emitToRoom, onRoomClosed } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 12 presence: who is currently viewing each project. Deliberately in-memory and never
// persisted (docs/SOCKET_EVENTS.md) - a roster is only meaningful while sockets are live, and it
// is rebuilt from room joins. Multi-device: a user stays online until their last socket leaves.
// Keyed by the canonical project id (lowercase ObjectId string, as built in rooms.js).

// projectId -> Map<userId, { name, sockets:Set<socketId> }>
const rosters = new Map();
// socketId -> Set<projectId>, so a disconnect clears only the rooms this socket had joined
const socketProjects = new Map();

const rosterArray = (roster) =>
  roster ? [...roster.entries()].map(([userId, entry]) => ({ userId, name: entry.name })) : [];

function broadcast(projectId) {
  emitToRoom(projectRoom(projectId), 'presence.updated', {
    projectId,
    online: rosterArray(rosters.get(projectId)),
  });
}

// Called after a socket has joined a project room, so a room-wide emit reaches the joiner too.
export function addPresence(socket, projectId) {
  const userId = socket.data.userId;
  let roster = rosters.get(projectId);
  if (!roster) {
    roster = new Map();
    rosters.set(projectId, roster);
  }
  let entry = roster.get(userId);
  if (!entry) {
    entry = { name: socket.data.userName ?? 'Someone', sockets: new Set() };
    roster.set(userId, entry);
  }
  entry.sockets.add(socket.id);

  let joined = socketProjects.get(socket.id);
  if (!joined) {
    joined = new Set();
    socketProjects.set(socket.id, joined);
  }
  joined.add(projectId);

  broadcast(projectId);
}

function dropSocket(socket, projectId) {
  const roster = rosters.get(projectId);
  const entry = roster?.get(socket.data.userId);
  if (!entry) return false;
  entry.sockets.delete(socket.id);
  if (entry.sockets.size === 0) roster.delete(socket.data.userId);
  if (roster.size === 0) rosters.delete(projectId);
  return true;
}

// Called after a socket leaves a specific project room (explicit room.leave).
export function leavePresence(socket, projectId) {
  if (dropSocket(socket, projectId)) {
    socketProjects.get(socket.id)?.delete(projectId);
    broadcast(projectId);
  }
}

// Called on disconnect: remove this socket from every project it was present in.
export function clearPresence(socket) {
  const joined = socketProjects.get(socket.id);
  if (!joined) return;
  for (const projectId of joined) {
    if (dropSocket(socket, projectId)) broadcast(projectId);
  }
  socketProjects.delete(socket.id);
}

// A closed (deleted / access-revoked) project has no live room anymore: forget its roster without
// broadcasting to a room that is being torn down. Registered once at module load.
onRoomClosed((projectId) => {
  rosters.delete(projectId);
  for (const set of socketProjects.values()) set.delete(projectId);
});
