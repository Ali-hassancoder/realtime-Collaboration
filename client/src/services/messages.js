import { apiRequest } from './api';

const base = (workspaceId, projectId) => `/api/workspaces/${workspaceId}/projects/${projectId}/messages`;
const send = (method, path, data) =>
  apiRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

const cursor = (before) => (before ? `?before=${before}` : '');

// Returns { messages, hasMore }; messages are chronological (oldest first)
export const listMessages = async (workspaceId, projectId, { before } = {}) =>
  (await apiRequest(`${base(workspaceId, projectId)}${cursor(before)}`)).data;

export const createMessage = async ({ workspaceId, projectId, body }) =>
  (await send('POST', base(workspaceId, projectId), { body })).data.message;

export const updateMessage = async ({ workspaceId, projectId, messageId, version, body }) =>
  (await send('PATCH', `${base(workspaceId, projectId)}/${messageId}`, { version, body })).data.message;

export const deleteMessage = ({ workspaceId, projectId, messageId }) =>
  send('DELETE', `${base(workspaceId, projectId)}/${messageId}`);
