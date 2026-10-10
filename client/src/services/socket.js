import { io } from 'socket.io-client';
import { env } from '../lib/env';

// Single shared instance. autoConnect is off so the app controls when to connect
// (important later, when connecting requires an auth token).
export const socket = io(env.apiUrl, {
  autoConnect: false,
  withCredentials: true,
});