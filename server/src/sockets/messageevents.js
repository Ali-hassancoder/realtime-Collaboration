import { emitToRoom } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 10 chat events (docs/SOCKET_EVENTS.md lives with this contract). One module owns the
// event names and payload shapes so REST handlers never build them by hand.
// Every payload carries actorId: the acting client ignores its own echo, because its REST
// response is already applied and the arrival order is not guaranteed.
// Payloads arrive pre-serialized from the message service (author embedded), not as documents.
const publish = (event, projectId, payload) => emitToRoom(projectRoom(String(projectId)), event, payload);

export const messageCreated = (projectId, message, actorId) =>
  publish('message.created', projectId, { message, actorId: String(actorId) });

export const messageUpdated = (projectId, message, actorId) =>
  publish('message.updated', projectId, { message, actorId: String(actorId) });

export const messageDeleted = (projectId, messageId, actorId) =>
  publish('message.deleted', projectId, { messageId: String(messageId), actorId: String(actorId) });
