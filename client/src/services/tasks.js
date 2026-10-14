
import { apiRequest } from './api';

const base = (workspaceId, projectId) => `/api/workspaces/${workspaceId}/projects/${projectId}/tasks`;
const send = (method, path, data) =>
  apiRequest(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

// Returns { columns: { todo: { tasks, total }, ... } }
export const getBoard = async (workspaceId, projectId) =>
  (await apiRequest(`${base(workspaceId, projectId)}/board`)).data;

export const getTask = async (workspaceId, projectId, taskId) =>
  (await apiRequest(`${base(workspaceId, projectId)}/${taskId}`)).data.task;

export const createTask = async ({ workspaceId, projectId, ...data }) =>
  (await send('POST', base(workspaceId, projectId), data)).data.task;

export const updateTask = async ({ workspaceId, projectId, taskId, ...data }) =>
  (await send('PATCH', `${base(workspaceId, projectId)}/${taskId}`, data)).data.task;

export const moveTask = async ({ workspaceId, projectId, taskId, version, status, prevId, nextId }) =>
  (await send('POST', `${base(workspaceId, projectId)}/${taskId}/move`, { version, status, prevId, nextId })).data.task;

export const deleteTask = ({ workspaceId, projectId, taskId }) =>
  send('DELETE', `${base(workspaceId, projectId)}/${taskId}`);