import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

const messageSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 2000 chars keeps the JSON body well under the 10 KB limit even for multi-byte scripts
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    // Optimistic concurrency: bumped on every edit; clients must send the version they saw
    version: { type: Number, default: 1 },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// One project's chat, newest first for cursor pagination
messageSchema.index({ projectId: 1, _id: -1 });
// Cleanup when a workspace goes away
messageSchema.index({ workspaceId: 1 });

export const Message = mongoose.model('Message', messageSchema);
