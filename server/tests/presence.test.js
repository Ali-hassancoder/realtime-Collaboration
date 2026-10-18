import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initSocket } from '../src/sockets/index.js';
import { User } from '../src/modules/users/users.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { WorkspaceMember } from '../src/modules/workspaces/workspaceMember.model.js';
import { WorkspaceInvite } from '../src/modules/workspaces/workspaceInvite.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { ProjectMember } from '../src/modules/projects/projectMember.model.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('presence and typing (realtime)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, member2, outsider;
  let workspaceId, projectId, project2Id;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@presence-test.example`;
    const res = await agent.post('/api/auth/register').send({ name: `${name} User`, email, password });
    assert.equal(res.status, 201);
    const cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    return { agent, email, id: res.body.data.user.id, cookie };
  }

  async function join(user, role) {
    const inv = await owner.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: user.email, role });
    assert.equal(inv.status, 201);
    const token = inv.body.data.inviteUrl.split('/').pop();
    const acc = await user.agent.post('/api/invites/accept').send({ token });
    assert.equal(acc.status, 200);
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

  const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

  async function joiner(user, p = projectId) {
    const socket = await connected(user.cookie);
    const res = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId: p });
    assert.equal(res.ok, true);
    return socket;
  }

  const namesOf = (roster) => roster.map((r) => r.name).sort();

  // Presence rosters are global per project, so each test gets its own project: a socket that has
  // not finished disconnecting from a previous test can never bleed into the next one's roster.
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
    member2 = await registerAgent('member2');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Presence Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Board' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    const second = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Second' });
    assert.equal(second.status, 201);
    project2Id = second.body.data.project.id;

    await join(member, 'member');
    await join(member2, 'member');
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@presence-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
    await ProjectMember.deleteMany({ workspaceId: { $in: wsIds } });
    await Project.deleteMany({ workspaceId: { $in: wsIds } });
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  test('joining a project room shows a live roster that grows as people arrive', async () => {
    const p = await makeProject('Roster');
    // Attach the collector before joining so the joiner's own roster (emitted during the join) is seen
    const ownerSocket = await connected(owner.cookie);
    const ownerSeen = collect(ownerSocket, 'presence.updated');
    const joined = await emit(ownerSocket, 'room.join', { type: 'project', workspaceId, projectId: p });
    assert.equal(joined.ok, true);
    await settle();
    assert.equal(ownerSeen.at(-1).projectId, p);
    assert.deepEqual(namesOf(ownerSeen.at(-1).online), ['owner User']);

    const memberSocket = await connected(member.cookie);
    const memberSeen = collect(memberSocket, 'presence.updated');
    const memberJoined = await emit(memberSocket, 'room.join', { type: 'project', workspaceId, projectId: p });
    assert.equal(memberJoined.ok, true);
    await settle();

    // Both sockets now see both people; the roster is the full list, not a delta
    assert.deepEqual(namesOf(ownerSeen.at(-1).online), ['member User', 'owner User']);
    assert.deepEqual(namesOf(memberSeen.at(-1).online), ['member User', 'owner User']);
    // The roster carries ids the client can dedupe/de-dash against
    assert.ok(ownerSeen.at(-1).online.every((person) => typeof person.userId === 'string' && person.name));

    memberSocket.disconnect();
    ownerSocket.disconnect();
    await settle();
  });

  test('a user who never joins the room receives no presence for it', async () => {
    const p = await makeProject('Silence');
    const ownerSocket = await joiner(owner, p);
    const outsiderSocket = await connected(outsider.cookie);
    const silence = collect(outsiderSocket, 'presence.updated');

    const memberSocket = await joiner(member, p);
    await settle();

    assert.deepEqual(silence, []); // presence never leaves the project room
    memberSocket.disconnect();
    ownerSocket.disconnect();
    outsiderSocket.disconnect();
    await settle();
  });

  test('disconnecting removes the user from everyone else roster', async () => {
    const p = await makeProject('Disconnect');
    const ownerSocket = await joiner(owner, p);
    const ownerSeen = collect(ownerSocket, 'presence.updated');
    const memberSocket = await joiner(member, p);
    await settle();
    assert.equal(ownerSeen.at(-1).online.length, 2);

    memberSocket.disconnect();
    await settle();
    assert.deepEqual(namesOf(ownerSeen.at(-1).online), ['owner User']);

    ownerSocket.disconnect();
    await settle();
  });

  test('an explicit room.leave also clears presence', async () => {
    const p = await makeProject('Leave');
    const ownerSocket = await joiner(owner, p);
    const ownerSeen = collect(ownerSocket, 'presence.updated');
    const memberSocket = await joiner(member, p);
    await settle();
    assert.equal(ownerSeen.at(-1).online.length, 2);

    const left = await emit(memberSocket, 'room.leave', { type: 'project', projectId: p });
    assert.equal(left.ok, true);
    await settle();
    assert.deepEqual(namesOf(ownerSeen.at(-1).online), ['owner User']);

    ownerSocket.disconnect();
    memberSocket.disconnect();
    await settle();
  });

  test('one user across two sockets counts once and stays online until both leave', async () => {
    const p = await makeProject('Multi');
    const ownerSocket = await joiner(owner, p);
    const ownerSeen = collect(ownerSocket, 'presence.updated');

    const a = await joiner(member, p);
    const b = await joiner(member, p); // same user, second socket
    await settle();
    // owner + member (member has two sockets but appears once)
    assert.equal(ownerSeen.at(-1).online.length, 2);

    a.disconnect();
    await settle();
    assert.equal(ownerSeen.at(-1).online.length, 2); // still present via socket b

    b.disconnect();
    await settle();
    assert.deepEqual(namesOf(ownerSeen.at(-1).online), ['owner User']);

    ownerSocket.disconnect();
    await settle();
  });

  test('typing is relayed to the rest of the room but never echoed to the sender', async () => {
    const p = await makeProject('Typing');
    const ownerSocket = await joiner(owner, p);
    const memberSocket = await joiner(member, p);

    const stray = await emit(memberSocket, 'typing.started', { projectId });
    // member joined p, not the shared projectId, so relaying there is refused rather than leaked
    assert.equal(stray.ok, false);
    assert.equal(stray.error.code, 'FORBIDDEN');

    const received = waitFor(ownerSocket, 'typing.started');
    const selfSeen = collect(memberSocket, 'typing.started');
    const ok = await emit(memberSocket, 'typing.started', { projectId: p });
    assert.equal(ok.ok, true);
    const [payload] = await received;
    assert.equal(payload.projectId, p);
    assert.equal(payload.user.id, member.id);
    assert.equal(payload.user.name, 'member User');

    await settle();
    assert.deepEqual(selfSeen, []); // the typist never sees its own indicator

    const stopped = waitFor(ownerSocket, 'typing.stopped');
    await emit(memberSocket, 'typing.stopped', { projectId: p });
    const [stopPayload] = await stopped;
    assert.equal(stopPayload.userId, member.id);

    ownerSocket.disconnect();
    memberSocket.disconnect();
    await settle();
  });

  test('rapid typing is throttled to one relay per window', async () => {
    const p = await makeProject('Throttle');
    const ownerSocket = await joiner(owner, p);
    const memberSocket = await joiner(member2, p);
    await settle();
    const heard = collect(ownerSocket, 'typing.started');

    for (let i = 0; i < 5; i += 1) {
      const res = await emit(memberSocket, 'typing.started', { projectId: p });
      assert.equal(res.ok, true); // each is acknowledged even when the relay is throttled
    }
    await settle();
    assert.equal(heard.length, 1); // five keystrokes, one relayed blip

    ownerSocket.disconnect();
    memberSocket.disconnect();
    await settle();
  });

  test('typing into a room the socket never joined is refused', async () => {
    const socket = await connected(outsider.cookie);
    const res = await emit(socket, 'typing.started', { projectId });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'FORBIDDEN');

    const bad = await emit(socket, 'typing.started', { projectId: 'not-an-object-id' });
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, 'VALIDATION_ERROR');

    socket.disconnect();
    await settle();
  });
});
