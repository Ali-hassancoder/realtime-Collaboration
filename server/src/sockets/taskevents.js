import { emitToRoom } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 8 task events (docs/SOCKET_EVENTS.md lives with this contract). One module owns the
// event names and payload shapes so REST handlers never build them by hand.
// Every payload carries actorId: the acting client ignores its own echo, because its REST
// response (or optimistic move) is already applied and the arrival order is not guaranteed.
const publish = (event, projectId, payload) => emitToRoom(projectRoom(String(projectId)), event, payload);

export const taskCreated = (projectId, task, actorId) =>
  publish('task.created', projectId, { task: task.toJSON(), actorId: String(actorId) });

export const taskUpdated = (projectId, task, actorId) =>
  publish('task.updated', projectId, { task: task.toJSON(), actorId: String(actorId) });

export const taskDeleted = (projectId, taskId, actorId) =>
  publish('task.deleted', projectId, { taskId: String(taskId), actorId: String(actorId) });
