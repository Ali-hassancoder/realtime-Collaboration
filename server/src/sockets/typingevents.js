import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { emitToRoomExcept } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 12 typing indicators (docs/SOCKET_EVENTS.md). Transient and never persisted: a "typing"
// blip is only worth the moment it happens. The client emits typing.started / typing.stopped; the
// server relays them to the rest of the project room (never back to the sender).

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id')
  .transform((s) => s.toLowerCase());

const payloadSchema = z.object({ projectId: objectId });

// Typing is the one high-frequency client event, so it gets its own throttle on top of the global
// per-socket limiter: at most one relayed typing.started per project per window per socket.
const TYPING_THROTTLE_MS = 3000;

function parse(payload) {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid typing request.');
  return parsed.data;
}

// The socket must already be in the room (a join is what authorized access), so a client cannot
// inject typing blips into a project it cannot see.
function requireMember(socket, projectId) {
  if (!socket.rooms.has(projectRoom(projectId))) {
    throw new AppError(403, 'FORBIDDEN', 'You must open the project first.');
  }
}

function allowedToAnnounce(socket, projectId) {
  const last = (socket.data.typingLast ??= new Map());
  const now = Date.now();
  const previous = last.get(projectId);
  if (previous && now - previous < TYPING_THROTTLE_MS) return false;
  last.set(projectId, now);
  return true;
}

export function typingStarted(socket, payload) {
  const { projectId } = parse(payload);
  requireMember(socket, projectId);
  if (allowedToAnnounce(socket, projectId)) {
    emitToRoomExcept(projectRoom(projectId), socket.id, 'typing.started', {
      projectId,
      user: { id: socket.data.userId, name: socket.data.userName ?? 'Someone' },
    });
  }
  return {};
}

export function typingStopped(socket, payload) {
  const { projectId } = parse(payload);
  requireMember(socket, projectId);
  // Stopping is never throttled: the indicator should clear the instant they send or leave.
  socket.data.typingLast?.delete(projectId);
  emitToRoomExcept(projectRoom(projectId), socket.id, 'typing.stopped', {
    projectId,
    userId: socket.data.userId,
  });
  return {};
}
