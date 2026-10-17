import { emitToRoom } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 9 comment events (docs/SOCKET_EVENTS.md lives with this contract). One module owns
// the event names and payload shapes so REST handlers never build them by hand.
// Every payload carries actorId: the acting client ignores its own echo, because its REST
// response is already applied and the arrival order is not guaranteed.
// Payloads arrive pre-serialized from the comment service (author embedded), not as documents.
const publish = (event, projectId, payload) => emitToRoom(projectRoom(String(projectId)), event, payload);

export const commentCreated = (projectId, comment, actorId) =>
  publish('comment.created', projectId, { comment, actorId: String(actorId) });

export const commentUpdated = (projectId, comment, actorId) =>
  publish('comment.updated', projectId, { comment, actorId: String(actorId) });

export const commentDeleted = (projectId, commentId, taskId, actorId) =>
  publish('comment.deleted', projectId, {
    commentId: String(commentId),
    taskId: String(taskId),
    actorId: String(actorId),
  });
