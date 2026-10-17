import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { Notification } from './notification.model.js';
import { notificationCreated } from '../../sockets/notificationevents.js';

// The REST and event shape: the actor name is embedded so clients need no extra lookup
const serialize = (notification) => {
  const { actorId, ...rest } = notification.toJSON();
  return {
    ...rest,
    actorId: String(actorId?.id ?? actorId),
    actor: actorId?.id ? { id: actorId.id, name: actorId.name } : null,
  };
};

// Fire-and-forget: a notification failure must never fail the action it describes.
// Self-notifications are dropped here, so callers don't repeat the check.
export async function notify({ recipientId, actor, type, workspaceId, projectId = null, taskId = null, meta = {} }) {
  try {
    if (!recipientId || String(recipientId) === String(actor._id)) return;
    const notification = await Notification.create({
      recipientId,
      actorId: actor._id,
      type,
      workspaceId,
      projectId,
      taskId,
      meta,
    });
    notificationCreated(recipientId, serialize(await notification.populate('actorId', 'name')));
  } catch (err) {
    logger.error({ err }, 'Failed to create notification');
  }
}

export async function listNotifications(userId, { before, limit, unread }) {
  // Newest-first query with a limit+1 probe; the inbox is served newest first
  const filter = {
    recipientId: userId,
    ...(before ? { _id: { $lt: before } } : {}),
    ...(unread ? { readAt: null } : {}),
  };
  const [found, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ _id: -1 }).limit(limit + 1).populate('actorId', 'name'),
    Notification.countDocuments({ recipientId: userId, readAt: null }),
  ]);
  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  return { notifications: page.map(serialize), hasMore, unreadCount };
}

// Idempotent: reading an already-read notification returns it unchanged
export async function markRead(userId, notificationId) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' }
  ).populate('actorId', 'name');
  if (updated) return serialize(updated);

  const existing = await Notification.findOne({ _id: notificationId, recipientId: userId }).populate('actorId', 'name');
  if (!existing) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  return serialize(existing);
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { recipientId: userId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { updated: result.modifiedCount };
}
