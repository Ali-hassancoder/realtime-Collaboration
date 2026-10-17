import { apiRequest } from './api';

const base = (workspaceId, projectId) => `/api/workspaces/${workspaceId}/projects/${projectId}/activity`;

// Returns { activities, hasMore }; activities are newest first
export const listActivity = async (workspaceId, projectId, { before } = {}) =>
  (await apiRequest(`${base(workspaceId, projectId)}${before ? `?before=${before}` : ''}`)).data;
