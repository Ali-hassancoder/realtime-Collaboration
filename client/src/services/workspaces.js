import { apiRequest } from './api';

const send = (method, path, data) =>
  apiRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const listWorkspaces = async () => (await apiRequest('/api/workspaces')).data.workspaces;
export const getWorkspace = async (id) => (await apiRequest(`/api/workspaces/${id}`)).data.workspace;
export const createWorkspace = async (data) => (await send('POST', '/api/workspaces', data)).data.workspace;
export const updateWorkspace = async ({ id, ...data }) => (await send('PATCH', `/api/workspaces/${id}`, data)).data.workspace;
export const deleteWorkspace = (id) => send('DELETE', `/api/workspaces/${id}`);

export const listMembers = async (id) => (await apiRequest(`/api/workspaces/${id}/members`)).data.members;
export const updateMemberRole = ({ id, userId, role }) => send('PATCH', `/api/workspaces/${id}/members/${userId}`, { role });
export const removeMember = ({ id, userId }) => send('DELETE', `/api/workspaces/${id}/members/${userId}`);

export const listInvites = async (id) => (await apiRequest(`/api/workspaces/${id}/invites`)).data.invites;
export const createInvite = async ({ id, ...data }) => (await send('POST', `/api/workspaces/${id}/invites`, data)).data;
export const deleteInvite = ({ id, inviteId }) => send('DELETE', `/api/workspaces/${id}/invites/${inviteId}`);

export const acceptInvite = async (token) => (await send('POST', '/api/invites/accept', { token })).data.workspace;