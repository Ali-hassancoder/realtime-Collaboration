import mongoose from 'mongoose';
import { jsonTransform } from '../../utils/mongoose.js';

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
// Keeps boards and the rebalance step bounded
export const MAX_TASKS_PER_PROJECT = 5000;

const taskSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // 2000 chars keeps the JSON body well under the 10 KB limit even for multi-byte scripts
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    // Order within a column. Float so a task can be dropped between two others without renumbering.
    position: { type: Number, required: true },
    // Optimistic concurrency: bumped on every change; clients must send the version they saw
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform: jsonTransform } }
);

// Board columns: one project, one status, in order
taskSchema.index({ projectId: 1, status: 1, position: 1, _id: 1 });
// Cleanup when someone leaves a workspace; also serves a future "my tasks" view
taskSchema.index({ workspaceId: 1, assigneeId: 1 });

export const Task = mongoose.model('Task', taskSchema);