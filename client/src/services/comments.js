import { apiRequest } from './api';

const base = (workspaceId, projectId, taskId) =>
  `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`;
const send = (method, path, data) =>
  apiRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

const cursor = (before) => (before ? `?before=${before}` : '');

// Returns { comments, hasMore }; comments are chronological (oldest first)
export const listComments = async (workspaceId, projectId, taskId, { before } = {}) =>
  (await apiRequest(`${base(workspaceId, projectId, taskId)}${cursor(before)}`)).data;

export const createComment = async ({ workspaceId, projectId, taskId, body }) =>
  (await send('POST', base(workspaceId, projectId, taskId), { body })).data.comment;

export const updateComment = async ({ workspaceId, projectId, taskId, commentId, version, body }) =>
  (await send('PATCH', `${base(workspaceId, projectId, taskId)}/${commentId}`, { version, body })).data.comment;

export const deleteComment = ({ workspaceId, projectId, taskId, commentId }) =>
  send('DELETE', `${base(workspaceId, projectId, taskId)}/${commentId}`);
