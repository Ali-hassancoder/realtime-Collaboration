import * as Y from 'yjs';
import { socket } from '../../services/socket';

// A minimal, purpose-built Yjs provider for our Project Notes channel. The public `y-socket-io`
// package targets the y-protocols sync/bcrypt handshake, which our server does not speak. What we
// do have is a narrow contract:
//
//   client -> server: doc.subscribe { projectId, stateVector? }   ack: { update, subscribers }
//   client -> server: doc.update    { projectId, update }          ack: {}
//   client -> server: doc.unsubscribe { projectId }                ack: {}
//   server -> client: doc.update    { projectId, update }
//   server -> client: doc.subscribers { projectId, subscribers }
//
// The provider owns a Y.Doc (the caller passes it in), keeps it in sync with the server, and
// rebroadcasts local edits as they happen. It never persists anything itself; the server debounces
// the writes into MongoDB.

const SUBSCRIBE_TIMEOUT_MS = 5000;

const toBytes = (value) => {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  // Some socket.io-client builds hand back Buffer, which is a Uint8Array subclass, so this is
  // only for a very defensive fallback in case a transpiler wraps it in an array-like.
  if (typeof value.byteLength === 'number' && typeof value[0] === 'number') {
    return Uint8Array.from(value);
  }
  return null;
};

export class SocketYjsProvider {
  constructor(ydoc, projectId) {
    this.ydoc = ydoc;
    this.projectId = projectId;
    this.status = 'connecting'; // connecting | ready | error | disconnected
    this.error = null;
    this.subscribers = [];
    this.started = false;
    this.listeners = new Set();

    // Bound handlers so `off` matches the exact reference used by `on`.
    this._onLocalUpdate = (update, origin) => {
      // 'remote' and 'restore' are what we call updates that came from the server or the initial
      // hydrate; echoing them back would be a feedback loop. Local edits come through with
      // origin='local' (or undefined), so those are the ones we forward.
      if (origin === 'remote' || origin === 'restore') return;
      if (!socket.connected) return;
      socket.emit('doc.update', { projectId: this.projectId, update });
    };
    this._onRemoteUpdate = (payload) => {
      if (payload?.projectId !== this.projectId) return;
      const bytes = toBytes(payload.update);
      if (!bytes || bytes.byteLength === 0) return;
      Y.applyUpdate(this.ydoc, bytes, 'remote');
    };
    this._onRoster = (payload) => {
      if (payload?.projectId !== this.projectId) return;
      this.subscribers = payload.subscribers ?? [];
      this._emit();
    };
    this._onConnect = () => {
      // (Re)subscribe on reconnect - the server starts a fresh connection with no subscriptions
      // for this socket, so the previous state is gone from its subscriber list.
      this._subscribe();
    };
    this._onDisconnect = () => {
      this.status = 'disconnected';
      this._emit();
    };
  }

  _emit() {
    for (const fn of this.listeners) fn();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async _subscribe() {
    if (!socket.connected) {
      this.status = 'connecting';
      this._emit();
      return;
    }
    this.status = 'connecting';
    this._emit();
    // Encode our current state vector so the server only sends ops we are missing. On a fresh
    // mount this is the entire state; on a reconnect it is just the delta from the offline window.
    const stateVector = Y.encodeStateVector(this.ydoc);
    try {
      const data = await new Promise((resolve, reject) => {
        socket
          .timeout(SUBSCRIBE_TIMEOUT_MS)
          .emit('doc.subscribe', { projectId: this.projectId, stateVector }, (timeoutError, response) => {
            if (timeoutError) return reject(new Error('The server did not respond in time.'));
            if (!response?.ok) return reject(Object.assign(new Error(response?.error?.message ?? 'subscribe failed'), { code: response?.error?.code }));
            resolve(response.data);
          });
      });
      const bytes = toBytes(data?.update);
      if (bytes && bytes.byteLength > 0) Y.applyUpdate(this.ydoc, bytes, 'restore');
      this.subscribers = data?.subscribers ?? [];
      this.status = 'ready';
      this.error = null;
      this._emit();
    } catch (err) {
      this.status = 'error';
      this.error = err.message;
      this._emit();
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.ydoc.on('update', this._onLocalUpdate);
    socket.on('doc.update', this._onRemoteUpdate);
    socket.on('doc.subscribers', this._onRoster);
    socket.on('connect', this._onConnect);
    socket.on('disconnect', this._onDisconnect);
    if (socket.connected) this._subscribe();
    else this._emit();
  }

  destroy() {
    if (!this.started) return;
    this.started = false;
    this.ydoc.off('update', this._onLocalUpdate);
    socket.off('doc.update', this._onRemoteUpdate);
    socket.off('doc.subscribers', this._onRoster);
    socket.off('connect', this._onConnect);
    socket.off('disconnect', this._onDisconnect);
    // Fire-and-forget: the server also cleans up on socket disconnect, so a missed unsubscribe
    // here (network blip) only delays the roster update by one heartbeat.
    if (socket.connected) socket.emit('doc.unsubscribe', { projectId: this.projectId });
    this.listeners.clear();
  }
}
