import * as Y from 'yjs';
import { logger } from '../../utils/logger.js';
import { Document } from './document.model.js';

// A live Y.Doc is held in memory for every project that has at least one subscriber. When the
// last subscriber leaves (or the project room closes) the in-memory copy is dropped after a
// best-effort final save. Snapshots are opaque Yjs binary updates - never parsed here.

// Coalescing window for the debounced persistence write. Typing bursts collapse into one write.
const SAVE_DEBOUNCE_MS = 4_000;

const registry = new Map(); // projectId (string) -> { ydoc, saveTimer, dirty, subscribers:Set<socketId>, workspaceId }

// Yjs transaction origin markers. Anything applied from a socket or the DB carries one of these
// so we know when the state actually changed (server-side merges do not need to be re-broadcast).
export const ORIGIN_REMOTE = 'remote';   // client -> server update, must rebroadcast
export const ORIGIN_RESTORE = 'restore'; // hydrating from DB, do not rebroadcast
// Anything else (undefined origin) is server-internal (initialization) and neither rebroadcasts
// nor marks the doc dirty on its own.

function getEntry(projectId) {
  return registry.get(String(projectId));
}

async function hydrate(ydoc, projectId) {
  const doc = await Document.findOne({ projectId }).lean();
  if (!doc?.snapshot) return;
  // The raw driver may hand back a Buffer, a Uint8Array, or a BSON Binary wrapper depending on
  // promoteBuffers. Normalize to a Uint8Array view of the exact bytes before feeding Yjs.
  const bytes = toBytes(doc.snapshot);
  if (!bytes || bytes.byteLength === 0) return;
  try {
    Y.applyUpdate(ydoc, bytes, ORIGIN_RESTORE);
  } catch (err) {
    // A corrupt snapshot must never lock the room. Log loudly, start empty, and let the next
    // successful save overwrite the bad bytes.
    logger.error({ err, projectId }, 'Yjs snapshot failed to hydrate; starting with empty doc');
  }
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  // BSON Binary (mongodb driver) exposes a .value() returning a Buffer
  if (typeof value?.value === 'function') return new Uint8Array(value.value());
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength ?? 0);
  return null;
}

function scheduleSave(projectId) {
  const entry = getEntry(projectId);
  if (!entry) return;
  entry.dirty = true;
  if (entry.saveTimer) return;
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    persist(projectId).catch((err) => logger.error({ err, projectId }, 'Yjs snapshot persist failed'));
  }, SAVE_DEBOUNCE_MS);
  entry.saveTimer.unref?.();
}

export async function persist(projectId) {
  const entry = getEntry(projectId);
  if (!entry) return;
  // Force a snapshot on demand (e.g. from closeDocument or flushForTest) even when nothing was
  // marked dirty, so an initial subscribe on a fresh doc does not leave the row unset.
  const update = Y.encodeStateAsUpdate(entry.ydoc);
  entry.dirty = false;
  await Document.findOneAndUpdate(
    { projectId: String(projectId) },
    { $set: { snapshot: Buffer.from(update), workspaceId: entry.workspaceId, lastEditorId: entry.lastEditorId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

// Load-or-create the in-memory Y.Doc for a project. Callers must be inside an authorised context
// (they already checked membership + document:read). Returns { ydoc, entry }.
export async function ensureLoaded(projectId, workspaceId) {
  const key = String(projectId);
  const existing = registry.get(key);
  if (existing) return existing;

  const ydoc = new Y.Doc();
  // Keep the shared type name stable so clients can bind to the same key.
  const entry = {
    ydoc,
    text: ydoc.getText('content'),
    workspaceId: String(workspaceId),
    subscribers: new Map(), // socketId -> { id, name }
    saveTimer: null,
    dirty: false,
    lastEditorId: null,
  };
  registry.set(key, entry);

  await hydrate(ydoc, key);
  return entry;
}

// Called by the socket layer once a client's transaction has been applied. Marks the doc for
// persistence. Rebroadcasting to other subscribers is the socket layer's job.
export function noteRemoteUpdate(projectId) {
  scheduleSave(projectId);
}

export function addSubscriber(projectId, socketId, info) {
  const entry = getEntry(projectId);
  if (!entry) return false;
  entry.subscribers.set(socketId, info ?? { id: null, name: null });
  return true;
}

// Returns true if this socket was actually subscribed (callers use that to decide whether
// a roster broadcast is worth emitting).
export function removeSubscriber(projectId, socketId) {
  const entry = getEntry(projectId);
  if (!entry) return false;
  return entry.subscribers.delete(socketId);
}

// Deduplicated by user id: the same person on two devices is one editor in the roster.
export function subscriberList(projectId) {
  const entry = getEntry(projectId);
  if (!entry) return [];
  const byUser = new Map();
  for (const info of entry.subscribers.values()) {
    if (info?.id) byUser.set(info.id, info);
  }
  return [...byUser.values()];
}

export function currentSnapshot(projectId, stateVector) {
  const entry = getEntry(projectId);
  if (!entry) return null;
  // With a state vector the reply is only the missing operations, which keeps initial sync small.
  return Y.encodeStateAsUpdate(entry.ydoc, stateVector ? new Uint8Array(stateVector) : undefined);
}

export function applyRemoteUpdate(projectId, updateBytes, userId) {
  const entry = getEntry(projectId);
  if (!entry) return false;
  Y.applyUpdate(entry.ydoc, new Uint8Array(updateBytes), ORIGIN_REMOTE);
  if (userId) entry.lastEditorId = String(userId);
  scheduleSave(projectId);
  return true;
}

// Drop the in-memory copy entirely. Called when the room closes (project deleted) or when the
// last subscriber leaves. Best-effort final save so no keystrokes are lost on eviction.
export function closeDocument(projectId) {
  const key = String(projectId);
  const entry = registry.get(key);
  if (!entry) return;
  if (entry.saveTimer) clearTimeout(entry.saveTimer);
  if (entry.dirty) {
    persist(key).catch((err) => logger.error({ err, projectId: key }, 'Yjs final persist failed'));
  }
  registry.delete(key);
}

// Test/dev hook: is the doc currently resident in memory?
export const isLoaded = (projectId) => registry.has(String(projectId));

// Test hook: force the pending debounced save to run now. Used by tests to verify persistence
// without waiting out the debounce window.
export async function flushForTest(projectId) {
  const entry = getEntry(projectId);
  if (!entry) return;
  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
  }
  await persist(projectId);
}
