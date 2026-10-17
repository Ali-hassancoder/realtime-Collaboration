import { io } from 'socket.io-client';
import { env } from '../lib/env';
import { refreshSession } from './api';

// autoConnect is off: the app connects only while a user is logged in (see useSocketLifecycle).
// The access cookie is sent with the handshake; no token is ever handled in JavaScript.
export const socket = io(env.apiUrl, { autoConnect: false, withCredentials: true });

const AUTH_ERROR_CODES = ['UNAUTHENTICATED', 'TOKEN_INVALID'];
const MAX_RECOVERIES = 3; // stops a loop if the handshake keeps failing after a successful refresh

let wanted = false; // does the app want a connection right now?
let recovering = false;
let recoveries = 0;
let authLostHandler = null;

// The server rejects the handshake (or drops the socket) when the access token has expired.
// Refresh the session over REST, then reconnect.
async function recover() {
  if (!wanted || recovering || recoveries >= MAX_RECOVERIES) return;
  recovering = true;
  recoveries += 1;
  try {
    if (await refreshSession()) {
      if (wanted && !socket.connected) socket.connect();
    } else {
      authLostHandler?.();
    }
  } finally {
    recovering = false;
  }
}

socket.on('connect', () => {
  recoveries = 0;
});
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') recover();
});
socket.on('connect_error', (err) => {
  if (AUTH_ERROR_CODES.includes(err.data?.code)) recover();
});

export function connectSocket({ onAuthLost } = {}) {
  wanted = true;
  recoveries = 0;
  if (onAuthLost) authLostHandler = onAuthLost;
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  wanted = false;
  socket.disconnect();
}

// Every client event is acknowledged with { ok, data } or { ok: false, error }
function emitWithAck(event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) return reject(new Error('The server did not respond in time.'));
      if (!response?.ok) {
        const err = new Error(response?.error?.message ?? 'Request failed');
        err.code = response?.error?.code;
        return reject(err);
      }
      return resolve(response.data);
    });
  });
}

// room: { type: 'workspace', workspaceId } or { type: 'project', workspaceId, projectId }
export const joinRoom = (room) => emitWithAck('room.join', room);
export const leaveRoom = (room) => emitWithAck('room.leave', room);