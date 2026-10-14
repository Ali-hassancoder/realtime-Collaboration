import { apiRequest } from './api';

const base = (workspaceId) => `/api/workspaces/${workspaceId}/projects`;
const send = (method, path, data) =>
  apiRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

// Returns { projects, total, page, limit }
export const listProjects = async (workspaceId, { status = 'active', page = 1 } = {}) =>
  (await apiRequest(`${base(workspaceId)}?status=${status}&page=${page}`)).data;

export const getProject = async (workspaceId, projectId) =>
  (await apiRequest(`${base(workspaceId)}/${projectId}`)).data.project;

export const createProject = async ({ workspaceId, ...data }) =>
  (await send('POST', base(workspaceId), data)).data.project;

export const updateProject = async ({ workspaceId, projectId, ...data }) =>
  (await send('PATCH', `${base(workspaceId)}/${projectId}`, data)).data.project;

export const deleteProject = ({ workspaceId, projectId }) => send('DELETE', `${base(workspaceId)}/${projectId}`);

export const listProjectMembers = async (workspaceId, projectId) =>
  (await apiRequest(`${base(workspaceId)}/${projectId}/members`)).data.members;

export const addProjectMember = ({ workspaceId, projectId, userId }) =>
  send('POST', `${base(workspaceId)}/${projectId}/members`, { userId });

export const removeProjectMember = ({ workspaceId, projectId, userId }) =>
  send('DELETE', `${base(workspaceId)}/${projectId}/members/${userId}`);