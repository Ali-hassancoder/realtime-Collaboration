import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

// Everything the feed knows how to render. Chat messages are deliberately absent: they are
// high-volume, low-signal and would drown the feed (docs/ENGINEERING_DECISIONS.md).
export const ACTIVITY_TYPES = ['task.created', 'task.updated', 'task.moved', 'task.deleted', 'comment.created'];

const activitySchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: ACTIVITY_TYPES },
    // Null when the entry is not tied to one task or the task no longer exists
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // Display breadcrumbs (title, field names, column names, a comment excerpt)
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// One project's feed, newest first for cursor pagination
activitySchema.index({ projectId: 1, _id: -1 });
// Cleanup when a task goes away; project and workspace cascades
activitySchema.index({ taskId: 1 });
activitySchema.index({ workspaceId: 1 });

export const Activity = mongoose.model('Activity', activitySchema);
