import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

const commentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 2000 chars keeps the JSON body well under the 10 KB limit even for multi-byte scripts
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    // Optimistic concurrency: bumped on every edit; clients must send the version they saw
    version: { type: Number, default: 1 },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// One task's thread, newest first for cursor pagination
commentSchema.index({ taskId: 1, _id: -1 });
// Cleanup when a project or workspace goes away
commentSchema.index({ projectId: 1 });
commentSchema.index({ workspaceId: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
