import { apiRequest } from './api';

const send = (method, path, data) => apiRequest(path, { method, body: JSON.stringify(data) });

export const updateProfile = async (data) => (await send('PATCH', '/api/users/me', data)).data.user;
export const changePassword = (data) => send('POST', '/api/users/me/password', data);