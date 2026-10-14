import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';
import { ROLES } from './workspace.permissions.js';

// Re-exported so existing imports keep working; the list lives in workspace.permissions.js
export { ROLES };

const memberSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// A user can belong to a workspace only once; also serves "members of workspace" queries
memberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
// "My workspaces" query
memberSchema.index({ userId: 1 });

export const WorkspaceMember = mongoose.model('WorkspaceMember', memberSchema);