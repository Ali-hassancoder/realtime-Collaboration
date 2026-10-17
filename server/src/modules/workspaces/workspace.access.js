import { WorkspaceMember } from './workspaceMember.model.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Strings only: socket payloads are untrusted, so an object like {"$ne": null} must never reach a query
export const isObjectId = (value) => typeof value === 'string' && OBJECT_ID.test(value);

// Used by both REST (loadMembership) and Socket.IO (room.join)
export async function findMembership(workspaceId, userId) {
  if (!isObjectId(workspaceId)) return null;
  return WorkspaceMember.findOne({ workspaceId, userId });
}