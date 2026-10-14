import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

const projectMemberSchema = new mongoose.Schema(
  {
    // workspaceId is stored here too so guest scoping and cleanup don't need a join
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// A user is on a project's team only once; also serves "team of project"
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// "Projects a guest can see" and cleanup when someone leaves a workspace
projectMemberSchema.index({ workspaceId: 1, userId: 1 });

export const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema);