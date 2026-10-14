import { Task } from './task.model.js';

// Tasks assigned to someone who loses access become unassigned. version is bumped so open
// boards holding the old copy get a conflict instead of silently overwriting.
// scope is { projectId } or { workspaceId }.
export async function unassignUser(scope, userId) {
  await Task.updateMany({ ...scope, assigneeId: userId }, { $set: { assigneeId: null }, $inc: { version: 1 } });
}