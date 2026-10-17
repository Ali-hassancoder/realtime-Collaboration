import { emitToRoom } from './realtime.js';
import { userRoom } from './rooms.js';

// Notifications are personal, so they never enter a project or workspace room:
// only the recipient's devices receive the event (docs/SOCKET_EVENTS.md)
const publish = (recipientId, payload) =>
  emitToRoom(userRoom(String(recipientId)), 'notification.created', payload);

export const notificationCreated = (recipientId, notification) => publish(recipientId, { notification });
