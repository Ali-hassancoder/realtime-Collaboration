import { emitToRoom } from './realtime.js';
import { projectRoom } from './rooms.js';

// Phase 9 activity events (docs/SOCKET_EVENTS.md lives with this contract).
// Unlike task/comment/message events there is no actorId filter: the feed is append-only and
// shows your own actions too, so the acting client dedupes by id instead of ignoring its echo.
// The payload arrives pre-serialized from the activity service (actor embedded).
const publish = (event, projectId, payload) => emitToRoom(projectRoom(String(projectId)), event, payload);

export const activityCreated = (projectId, activity) => publish('activity.created', projectId, { activity });
