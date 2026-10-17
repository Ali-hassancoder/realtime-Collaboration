// Room names are built in exactly one place. Ids must be canonical (lowercase ObjectId strings).
export const workspaceRoom = (workspaceId) => `workspace:${workspaceId}`;
export const projectRoom = (projectId) => `project:${projectId}`;
export const userRoom = (userId) => `user:${userId}`;