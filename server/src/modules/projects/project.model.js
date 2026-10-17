import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

export const PROJECT_STATUSES = ['active', 'archived'];

const projectSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

projectSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

export const Project = mongoose.model('Project', projectSchema);

