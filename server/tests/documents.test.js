import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';
import * as Y from 'yjs';
import { createApp } from '../src/app.js';
import { initSocket } from '../src/sockets/index.js';
import { User } from '../src/modules/users/users.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { WorkspaceMember } from '../src/modules/workspaces/workspaceMember.model.js';
import { WorkspaceInvite } from '../src/modules/workspaces/workspaceInvite.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { ProjectMember } from '../src/modules/projects/projectMember.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import * as docService from '../src/modules/documents/document.service.js';
import { configureDocUpdateLimit } from '../src/sockets/documentevents.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('documents (realtime, Phase 13)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, guest, outsider;
  let workspaceId, projectId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@documents-test.example`;
    const res = await agent.post('/api/auth/register').send({ name: `${name} User`, email, password });
    assert.equal(res.status, 201);
    const cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    return { agent, email, id: res.body.data.user.id, cookie };
  }

  async function joinWorkspace(user, role) {
    const inv = await owner.agent
      .post(`/api/workspaces/${workspaceId}/invites`)
      .send({ email: user.email, role });
    assert.equal(inv.status, 201);
    const token = inv.body.data.inviteUrl.split('/').pop();
    const acc = await user.agent.post('/api/invites/accept').send({ token });
    assert.equal(acc.status, 200);
  }

  async function addToProjectTeam(user, p = projectId) {
    const res = await owner.agent
      .post(`/api/workspaces/${workspaceId}/projects/${p}/members`)
      .send({ userId: user.id });
    assert.equal(res.status, 201);
  }

  const open = (cookie) =>
    new Promise((resolve) => {
      const socket = connect(baseUrl, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: { cookie },
      });
      clients.push(socket);
      socket.once('connect', () => resolve({ socket }));
      socket.once('connect_error', (error) => resolve({ socket, error }));
    });

  async function connected(cookie) {
    const { socket, error } = await open(cookie);
    assert.ifError(error);
    return socket;
  }

  const emit = (socket, event, payload) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No acknowledgement for "${event}"`)), 3000);
      socket.emit(event, payload, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

  const waitFor = (socket, event, ms = 3000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);
      socket.once(event, (...args) => {
        clearTimeout(timer);
        resolve(args);
      });
    });

  const collect = (socket, event) => {
    const seen = [];
    socket.on(event, (payload) => seen.push(payload));
    return seen;
  };

  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

  async function joinRoom(user, p = projectId) {
    const socket = await connected(user.cookie);
    const res = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId: p });
    assert.equal(res.ok, true);
    return socket;
  }

  // Simulates a real client: bind a fresh Y.Doc, subscribe on the socket, apply the server's
  // missing ops, and return both. Subsequent edits flow through sendUpdate().
  async function subscribeWithYDoc(socket, p = projectId) {
    const ydoc = new Y.Doc();
    const stateVector = Y.encodeStateVector(ydoc);
    const res = await emit(socket, 'doc.subscribe', { projectId: p, stateVector });
    if (!res.ok) throw Object.assign(new Error(res.error?.message ?? 'subscribe failed'), res.error);
    Y.applyUpdate(ydoc, new Uint8Array(res.data.update));
    return { ydoc, subscribers: res.data.subscribers };
  }

  // Push the current local diff since `remoteStateVector` to the server.
  async function pushLocalUpdate(socket, ydoc, remoteStateVector, p = projectId) {
    const update = Y.encodeStateAsUpdate(ydoc, remoteStateVector);
    return emit(socket, 'doc.update', { projectId: p, update });
  }

  async function makeProject(name) {
    const res = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name });
    assert.equal(res.status, 201);
    return res.body.data.project.id;
  }

  before(async () => {
    await mongoose.connect(testUri);
    httpServer = http.createServer(app);
    io = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

    owner = await registerAgent('owner');
    member = await registerAgent('member');
    guest = await registerAgent('guest');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Docs Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Notes Home' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await joinWorkspace(member, 'member');
    await joinWorkspace(guest, 'guest');
    // guest is added to the base project team so tests using `projectId` still authorize;
    // per-test projects (via makeProject) call addToProjectTeam(guest, p) explicitly.
    await addToProjectTeam(guest);
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@documents-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
    await Document.deleteMany({ workspaceId: { $in: wsIds } });
    await ProjectMember.deleteMany({ workspaceId: { $in: wsIds } });
    await Project.deleteMany({ workspaceId: { $in: wsIds } });
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  test('two subscribers converge on the same state after real concurrent edits', async () => {
    const p = await makeProject('Converge');
    const socketA = await joinRoom(member, p);
    const socketB = await joinRoom(owner, p);

    const a = await subscribeWithYDoc(socketA, p);
    const b = await subscribeWithYDoc(socketB, p);

    // A writes "hello" and pushes. B must already be listening when the server broadcasts,
    // so attach the waiter *before* the emit or the rebroadcast races past the listener.
    a.ydoc.transact(() => a.ydoc.getText('content').insert(0, 'hello'));
    const bVectorBefore = Y.encodeStateVector(b.ydoc);
    const rebroadcastPromise = waitFor(socketB, 'doc.update', 3000);
    const pushA = await pushLocalUpdate(socketA, a.ydoc, bVectorBefore, p);
    assert.equal(pushA.ok, true);

    const [rebroadcast] = await rebroadcastPromise;
    Y.applyUpdate(b.ydoc, new Uint8Array(rebroadcast.update));
    assert.equal(b.ydoc.getText('content').toString(), 'hello');

    // B appends " world" concurrently and pushes. A hears it.
    b.ydoc.transact(() => b.ydoc.getText('content').insert(5, ' world'));
    const aVectorNow = Y.encodeStateVector(a.ydoc);
    const rebroadcast2Promise = waitFor(socketA, 'doc.update', 3000);
    const pushB = await pushLocalUpdate(socketB, b.ydoc, aVectorNow, p);
    assert.equal(pushB.ok, true);

    const [rebroadcast2] = await rebroadcast2Promise;
    Y.applyUpdate(a.ydoc, new Uint8Array(rebroadcast2.update));
    assert.equal(a.ydoc.getText('content').toString(), 'hello world');
    assert.equal(b.ydoc.getText('content').toString(), 'hello world');
  });

  test('doc.update rebroadcast excludes the sender socket', async () => {
    const p = await makeProject('No Echo');
    const sender = await joinRoom(member, p);
    const receiver = await joinRoom(owner, p);
    const s = await subscribeWithYDoc(sender, p);
    await subscribeWithYDoc(receiver, p);

    const seen = collect(sender, 'doc.update');
    s.ydoc.transact(() => s.ydoc.getText('content').insert(0, 'only once'));
    await pushLocalUpdate(sender, s.ydoc, undefined, p);
    await settle(250);
    assert.equal(seen.length, 0, 'sender must not receive its own update back');
  });

  test('an outsider who never joined the room is refused', async () => {
    const p = await makeProject('Outsider');
    // Outsider is not a member of the workspace, so they can't join the room at all -
    // and doc.subscribe before joinRoom must fail.
    const socket = await connected(outsider.cookie);
    const res = await emit(socket, 'doc.subscribe', { projectId: p });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'FORBIDDEN');
  });

  test('guest may read but cannot edit the shared document', async () => {
    const p = await makeProject('Guest Read-Only');
    // Guest is project-scoped, so the per-test project must explicitly add them to its team
    await addToProjectTeam(guest, p);
    const guestSocket = await joinRoom(guest, p);
    const sub = await emit(guestSocket, 'doc.subscribe', { projectId: p });
    assert.equal(sub.ok, true);

    // Simulated write payload - a valid Yjs update with one character. The permission check
    // must reject this before the update is applied.
    const tmp = new Y.Doc();
    tmp.transact(() => tmp.getText('content').insert(0, 'x'));
    const update = Y.encodeStateAsUpdate(tmp);

    const denied = await emit(guestSocket, 'doc.update', { projectId: p, update });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'FORBIDDEN');
  });

  test('subscribers roster is broadcast on subscribe and unsubscribe', async () => {
    const p = await makeProject('Roster');
    const first = await joinRoom(member, p);
    await subscribeWithYDoc(first, p);

    const second = await joinRoom(owner, p);
    const rosterSeen = collect(second, 'doc.subscribers');
    // Omit stateVector: an empty Uint8Array is dropped by Socket.IO's binary encoder and
    // trips validation; letting the server default to full-state is the same semantic.
    const subRes = await emit(second, 'doc.subscribe', { projectId: p });
    assert.equal(subRes.ok, true, `subscribe failed: ${JSON.stringify(subRes.error)}`);
    // Server's reply already lists both editors (deduplicated by user id).
    assert.equal(subRes.data.subscribers.length, 2);

    const unRes = await emit(second, 'doc.unsubscribe', { projectId: p });
    assert.equal(unRes.ok, true);
    // The unsubscribed user's own socket receives the updated roster.
    // (broadcastRoster on unsubscribe sends to everyone in the room, including the leaver.)
    await settle(150);
    assert.ok(rosterSeen.length >= 1, 'second socket should see a roster broadcast');
    const last = rosterSeen.at(-1);
    assert.equal(last.subscribers.length, 1);
    assert.equal(last.subscribers[0].name, 'member User');
  });

  test('offline catchup: a new subscriber receives state written by an earlier editor', async () => {
    const p = await makeProject('Catchup');
    const writer = await joinRoom(member, p);
    const w = await subscribeWithYDoc(writer, p);
    w.ydoc.transact(() => w.ydoc.getText('content').insert(0, 'persisted thoughts'));
    await pushLocalUpdate(writer, w.ydoc, undefined, p);
    await docService.flushForTest(p);
    writer.disconnect();

    // A brand-new socket on a different user, with a fresh Y.Doc, must receive the current state
    // through the sync reply (not any prior knowledge).
    const latecomer = await joinRoom(owner, p);
    const c = await subscribeWithYDoc(latecomer, p);
    assert.equal(c.ydoc.getText('content').toString(), 'persisted thoughts');
  });

  test('snapshot round-trips through MongoDB (evict + reload)', async () => {
    const p = await makeProject('Persist');
    const socket = await joinRoom(member, p);
    const s = await subscribeWithYDoc(socket, p);
    s.ydoc.transact(() => s.ydoc.getText('content').insert(0, 'survives eviction'));
    await pushLocalUpdate(socket, s.ydoc, undefined, p);
    await docService.flushForTest(p);

    // Drop the in-memory copy entirely, as the room-close hook would.
    docService.closeDocument(p);
    assert.equal(docService.isLoaded(p), false);

    // Reload: subscribe again; hydration must reconstruct the text from the DB snapshot.
    const freshSocket = await joinRoom(owner, p);
    const re = await subscribeWithYDoc(freshSocket, p);
    assert.equal(re.ydoc.getText('content').toString(), 'survives eviction');
  });

  test('deleting the project removes the document row', async () => {
    const p = await makeProject('Cascade');
    const socket = await joinRoom(member, p);
    const s = await subscribeWithYDoc(socket, p);
    s.ydoc.transact(() => s.ydoc.getText('content').insert(0, 'gone with the project'));
    await pushLocalUpdate(socket, s.ydoc, undefined, p);
    await docService.flushForTest(p);
    assert.ok(await Document.findOne({ projectId: p }), 'doc row must exist before delete');

    const del = await owner.agent.delete(`/api/workspaces/${workspaceId}/projects/${p}`);
    assert.equal(del.status, 200);
    assert.equal(await Document.findOne({ projectId: p }), null, 'doc row must cascade with the project');
  });

  test('oversized doc.update payload is rejected as a validation error', async () => {
    const p = await makeProject('Big Payload');
    const socket = await joinRoom(member, p);
    await subscribeWithYDoc(socket, p);
    // One byte above the 128 KB cap enforced in documentevents.js
    const tooBig = new Uint8Array(128 * 1024 + 1);
    const res = await emit(socket, 'doc.update', { projectId: p, update: tooBig });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VALIDATION_ERROR');
  });

  test('archived project rejects doc.update (server-side read-only enforcement)', async () => {
    const p = await makeProject('Archive Me');
    // Archive the project via REST
    const archiveRes = await owner.agent
      .patch(`/api/workspaces/${workspaceId}/projects/${p}`)
      .send({ status: 'archived' });
    assert.equal(archiveRes.status, 200);

    const socket = await joinRoom(member, p);
    const sub = await emit(socket, 'doc.subscribe', { projectId: p });
    assert.equal(sub.ok, true, 'subscribe must still work for archived projects (read allowed)');

    // Attempt a write - must be rejected because the project is archived
    const tmp = new Y.Doc();
    tmp.transact(() => tmp.getText('content').insert(0, 'nope'));
    const update = Y.encodeStateAsUpdate(tmp);
    const denied = await emit(socket, 'doc.update', { projectId: p, update });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'FORBIDDEN');
  });

  test('per-user doc.update cap rejects excess updates (Phase 15)', async () => {
    // Shrink the default 300/min so the test can cross the cap without spamming;
    // reconfiguring rebuilds the limiter, so counts start clean.
    configureDocUpdateLimit({ limit: 3, windowMs: 60_000 });
    try {
      const p = await makeProject('Rate Cap');
      const socket = await joinRoom(member, p);
      await subscribeWithYDoc(socket, p);

      const tmp = new Y.Doc();
      tmp.transact(() => tmp.getText('content').insert(0, 'flood'));
      const update = Y.encodeStateAsUpdate(tmp);

      for (let i = 1; i <= 3; i += 1) {
        const res = await emit(socket, 'doc.update', { projectId: p, update });
        assert.equal(res.ok, true, `update ${i} must be accepted under the cap`);
      }
      const blocked = await emit(socket, 'doc.update', { projectId: p, update });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.error.code, 'RATE_LIMITED');

      // The cap is per user, not global: the owner's writes still flow.
      const ownerSocket = await joinRoom(owner, p);
      await subscribeWithYDoc(ownerSocket, p);
      const other = await emit(ownerSocket, 'doc.update', { projectId: p, update });
      assert.equal(other.ok, true, "another user's updates must not be capped by member's burst");
    } finally {
      // Restore the production default so later tests (if any) see normal limits.
      configureDocUpdateLimit({ limit: 300, windowMs: 60_000 });
    }
  });
});
