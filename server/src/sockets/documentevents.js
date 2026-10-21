import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { can, isProjectScoped } from '../modules/workspaces/workspace.permissions.js';
import { WorkspaceMember } from '../modules/workspaces/workspaceMember.model.js';
import { Project } from '../modules/projects/project.model.js';
import { ProjectMember } from '../modules/projects/projectMember.model.js';
import { isObjectId } from '../modules/workspaces/workspace.access.js';
import { createKeyedLimiter } from './limits.js';
import { emitToRoom, emitToRoomExcept, onRoomClosed } from './realtime.js';
import { projectRoom } from './rooms.js';
import * as doc from '../modules/documents/document.service.js';

// Drop the in-memory Y.Doc when the room closes (project deleted, or the workspace containing
// it was deleted). The DB cascade in project.service.js / workspace.service.js removes the
// snapshot row; this removes the live copy and flushes any unsaved delta.
onRoomClosed((projectId) => doc.closeDocument(projectId));

// Payloads are untrusted. ObjectIds are strings, binary buffers arrive as Uint8Array/Buffer
// from Socket.IO, and every byte length is capped so a client cannot exhaust memory with a
// huge synthetic update. Yjs naturally produces small deltas for text edits, so these limits
// are generous for real use but bounded against abuse.
const objectId = z.string().refine(isObjectId, 'Invalid id').transform((s) => s.toLowerCase());
const MAX_UPDATE_BYTES = 128 * 1024; // 128 KB per Yjs update - far above any realistic text edit
const MAX_STATE_VECTOR_BYTES = 4 * 1024;

const bytes = (max) =>
  z
    .union([z.instanceof(Uint8Array), z.instanceof(ArrayBuffer), z.instanceof(Buffer)])
    .transform((v) => (v instanceof Uint8Array ? v : new Uint8Array(v)))
    .refine((v) => v.byteLength <= max, `Payload exceeds ${max} bytes`);

const subscribeSchema = z.object({
  projectId: objectId,
  stateVector: bytes(MAX_STATE_VECTOR_BYTES).optional(),
});

const updateSchema = z.object({
  projectId: objectId,
  update: bytes(MAX_UPDATE_BYTES),
});

const unsubscribeSchema = z.object({ projectId: objectId });

// (Phase 15) Per-user cap on doc.update. The global per-socket packet limiter (60 events/10 s)
// covers all events together, and one user may hold up to 10 sockets, so without this cap a
// scripted client could still push thousands of Yjs updates per minute against the Notes doc.
// 300/min is far above human typing (at most one update per keystroke). Rejected updates are
// never queued - the sender's Yjs provider resyncs naturally on the next accepted transaction.
const DOC_UPDATE_RATE = { limit: 300, windowMs: 60_000 };
let docUpdateAllowed = createKeyedLimiter(DOC_UPDATE_RATE);
setInterval(() => docUpdateAllowed.sweep(), DOC_UPDATE_RATE.windowMs).unref();

// Test seam: rebuild the limiter with a different cap (also clears current counts).
export function configureDocUpdateLimit({ limit, windowMs }) {
  docUpdateAllowed = createKeyedLimiter({ limit, windowMs });
}

// Room membership alone is not enough - a role change since joinRoom would leave stale access.
// Re-derive workspace membership + project accessibility + document permission from the DB every
// time. This mirrors the re-check pattern in roomhandler.js.
async function authorize(userId, projectId, action) {
  const project = await Project.findById(projectId).select('workspaceId status').lean();
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');

  const membership = await WorkspaceMember.findOne({ workspaceId: project.workspaceId, userId }).select('role').lean();
  if (!membership) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  if (!can(membership.role, 'project:read')) throw new AppError(403, 'FORBIDDEN', 'No access.');
  if (isProjectScoped(membership.role)) {
    const onTeam = await ProjectMember.exists({ projectId: project._id, userId });
    if (!onTeam) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
  if (!can(membership.role, action)) throw new AppError(403, 'FORBIDDEN', 'No access.');
  // Archived projects are read-only for everything; doc edits must respect that too
  if (action === 'document:edit' && project.status === 'archived') {
    throw new AppError(403, 'FORBIDDEN', 'This project is archived.');
  }

  return { project, membership };
}

// doc.subscribe: verify access, hydrate the Y.Doc if needed, register the subscriber, and reply
// with only the operations the client's state vector is missing. The reply carries binary.
export async function docSubscribe(socket, payload) {
  const parsed = subscribeSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid document request.');
  const { projectId, stateVector } = parsed.data;

  // The socket must already be in the project room (see room.join). This keeps doc traffic
  // within the same membership boundary we established for chat, activity, and presence.
  if (!socket.rooms.has(projectRoom(projectId))) {
    throw new AppError(403, 'FORBIDDEN', 'You must open the project first.');
  }
  const { project } = await authorize(socket.data.userId, projectId, 'document:read');

  await doc.ensureLoaded(projectId, project.workspaceId);
  doc.addSubscriber(projectId, socket.id, { id: socket.data.userId, name: socket.data.userName });

  const update = doc.currentSnapshot(projectId, stateVector);
  // Tell everyone else in the room that the roster of editors changed.
  emitToRoomExcept(projectRoom(projectId), socket.id, 'doc.subscribers', {
    projectId,
    subscribers: doc.subscriberList(projectId),
  });

  return { update: update ?? new Uint8Array(0), subscribers: doc.subscriberList(projectId) };
}

export async function docUnsubscribe(socket, payload) {
  const parsed = unsubscribeSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid document request.');
  const { projectId } = parsed.data;
  if (doc.removeSubscriber(projectId, socket.id)) {
    emitToRoom(projectRoom(projectId), 'doc.subscribers', {
      projectId,
      subscribers: doc.subscriberList(projectId),
    });
  }
  return {};
}

export async function docUpdate(socket, payload) {
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid document update.');

  // Cheapest rejection first, before the room check and the DB reads in authorize()
  if (docUpdateAllowed(socket.data.userId) === 'limited') {
    throw new AppError(429, 'RATE_LIMITED', 'Too many document updates. Please slow down.');
  }

  const { projectId, update } = parsed.data;

  if (!socket.rooms.has(projectRoom(projectId))) {
    throw new AppError(403, 'FORBIDDEN', 'You must open the project first.');
  }
  const { project } = await authorize(socket.data.userId, projectId, 'document:edit');

  // Ensure the doc is resident (a race where the doc closed between subscribe and update would
  // otherwise drop the write) and apply. Yjs merges idempotently, so duplicate updates are safe.
  await doc.ensureLoaded(projectId, project.workspaceId);
  doc.applyRemoteUpdate(projectId, update, socket.data.userId);

  // Rebroadcast to everyone else in the project room. Clients that are not viewing Notes will
  // see the event and filter it out in their provider; that keeps the server simpler than
  // tracking subscriber-scoped rooms.
  emitToRoomExcept(projectRoom(projectId), socket.id, 'doc.update', { projectId, update });
  return {};
}

// Called from sockets/index.js disconnect handler. Broadcasts a roster update for every project
// doc this socket had subscribed to. No-op for sockets that never touched a document.
export function cleanupSocketDocs(socket) {
  const seen = new Set();
  for (const room of socket.rooms) {
    if (!room.startsWith('project:')) continue;
    const projectId = room.slice('project:'.length);
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    if (doc.removeSubscriber(projectId, socket.id)) {
      emitToRoom(projectRoom(projectId), 'doc.subscribers', {
        projectId,
        subscribers: doc.subscriberList(projectId),
      });
    }
  }
}
