import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';
import { ASSIGNABLE_ROLES } from './workspace.permissions.js';

const inviteSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ASSIGNABLE_ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.tokenHash;
        return jsonTransform(doc, ret);
      },
    },
  }
);

// One pending invite per email per workspace (re-inviting replaces it)
inviteSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
// Expired invites are removed automatically
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WorkspaceInvite = mongoose.model('WorkspaceInvite', inviteSchema);