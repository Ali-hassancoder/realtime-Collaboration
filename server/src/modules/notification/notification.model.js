import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

export const NOTIFICATION_TYPES = ['task.assigned', 'comment.created', 'project.member_added', 'invite.accepted'];

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // Kept for navigation and cleanup, not for access checks (the inbox is personal)
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // Display data only (task title, excerpt...), so opening a notification needs no lookup
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// One user's inbox, newest first for cursor pagination
notificationSchema.index({ recipientId: 1, _id: -1 });
// Unread counts and "mark all read"
notificationSchema.index({ recipientId: 1, readAt: 1 });
// Cleanup when a task, project, workspace or membership goes away
notificationSchema.index({ taskId: 1 });
notificationSchema.index({ projectId: 1 });
notificationSchema.index({ workspaceId: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
