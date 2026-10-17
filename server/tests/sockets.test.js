import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
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

describe('sockets', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, alice, bob, carol, mallory, dave, erin;
  let workspaceId, projectId, mallorysWorkspaceId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@sockets-test.example`;
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

  // Resolves with { socket } when connected, or { socket, error } when the handshake is rejected
  const open = (cookie, extra = {}) =>
    new Promise((resolve) => {
      const socket = connect(baseUrl, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: cookie ? { cookie } : {},
        ...extra,
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

  const until = async (check, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.fail('Condition was not met in time');
  };

  // Server-side truth: is this client's socket currently in the room?
  const inRoom = async (room, socket) => (await io.in(room).fetchSockets()).some((s) => s.id === socket.id);

  before(async () => {
    await mongoose.connect(testUri);
    httpServer = http.createServer(app);
    io = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

    owner = await registerAgent('owner');
    alice = await registerAgent('alice');
    bob = await registerAgent('bob');
    carol = await registerAgent('carol');
    mallory = await registerAgent('mallory');
    dave = await registerAgent('dave');
    erin = await registerAgent('erin');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Sockets Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const other = await mallory.agent.post('/api/workspaces').send({ name: 'Mallory Team' });
    assert.equal(other.status, 201);
    mallorysWorkspaceId = other.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Live Project' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(alice, 'member');
    await join(bob, 'member');
    await join(carol, 'guest'); // not on the project's team
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@sockets-test\.example$/ }).select('_id');
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

  test('rejects connections without valid credentials', async () => {
    const secret = process.env.JWT_ACCESS_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const token = (payload, key = secret) => `access_token=${jwt.sign(payload, key, { algorithm: 'HS256' })}`;

    const cases = [
      ['no cookie', undefined, 'UNAUTHENTICATED'],
      ['garbage token', 'access_token=garbage', 'TOKEN_INVALID'],
      ['wrong secret', token({ sub: owner.id, exp: now + 60 }, 'x'.repeat(48)), 'TOKEN_INVALID'],
      ['expired token', token({ sub: owner.id, exp: now - 10 }), 'TOKEN_INVALID'],
      ['unknown user', token({ sub: new mongoose.Types.ObjectId().toString(), exp: now + 60 }), 'UNAUTHENTICATED'],
    ];
    for (const [label, cookie, code] of cases) {
      const { socket, error } = await open(cookie);
      assert.ok(error, label);
      assert.equal(error.data?.code, code, label);
      assert.equal(socket.connected, false, label);
    }
  });

  test('rejects browsers connecting from another origin', async () => {
    const { socket, error } = await open(undefined, {
      extraHeaders: { cookie: owner.cookie, origin: 'http://evil.example' },
    });
    assert.ok(error);
    assert.equal(socket.connected, false);
  });

  test('a valid session connects and is placed in its own user room', async () => {
    const socket = await connected(alice.cookie);
    assert.equal(socket.connected, true);
    assert.equal(await inRoom(`user:${alice.id}`, socket), true);
  });

  test('members can join workspace and project rooms; ids are canonicalised', async () => {
    const socket = await connected(alice.cookie);

    const ws = await emit(socket, 'room.join', { type: 'workspace', workspaceId });
    assert.deepEqual(ws, { ok: true, data: { room: `workspace:${workspaceId}` } });

    const project = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId: projectId.toUpperCase() });
    assert.deepEqual(project, { ok: true, data: { room: `project:${projectId}` } });
    assert.equal(await inRoom(`project:${projectId}`, socket), true);
  });

  test('outsiders and unassigned guests cannot join, and REST agrees', async () => {
    const m = await connected(mallory.cookie);
    let res = await emit(m, 'room.join', { type: 'workspace', workspaceId });
    assert.equal(res.error.code, 'WORKSPACE_NOT_FOUND');
    res = await emit(m, 'room.join', { type: 'project', workspaceId, projectId });
    assert.equal(res.error.code, 'WORKSPACE_NOT_FOUND');
    // Her own workspace id with someone else's project id
    res = await emit(m, 'room.join', { type: 'project', workspaceId: mallorysWorkspaceId, projectId });
    assert.equal(res.error.code, 'PROJECT_NOT_FOUND');
    assert.equal(await inRoom(`workspace:${workspaceId}`, m), false);
    assert.equal(await inRoom(`project:${projectId}`, m), false);

    const c = await connected(carol.cookie);
    res = await emit(c, 'room.join', { type: 'project', workspaceId, projectId });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'PROJECT_NOT_FOUND');
    const rest = await carol.agent.get(`/api/workspaces/${workspaceId}/projects/${projectId}`);
    assert.equal(rest.status, 404);
    assert.equal(rest.body.error.code, 'PROJECT_NOT_FOUND');

    // A guest may join the workspace room
    res = await emit(c, 'room.join', { type: 'workspace', workspaceId });
    assert.equal(res.ok, true);
  });

  test('malformed room requests are rejected', async () => {
    const socket = await connected(alice.cookie);
    const bad = [
      undefined,
      null,
      'project',
      42,
      {},
      { type: 'user', userId: alice.id },
      { type: 'workspace' },
      { type: 'workspace', workspaceId: 'not-an-id' },
      { type: 'workspace', workspaceId: { $ne: null } },
      { type: 'project', workspaceId },
      { type: 'project', workspaceId, projectId: ['x'] },
    ];
    for (const payload of bad) {
      const res = await emit(socket, 'room.join', payload);
      assert.equal(res.ok, false, JSON.stringify(payload));
      assert.equal(res.error.code, 'VALIDATION_ERROR', JSON.stringify(payload));
    }
  });

  test('leaving a room works, and the personal room cannot be left', async () => {
    const socket = await connected(alice.cookie);
    await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });

    const res = await emit(socket, 'room.leave', { type: 'project', projectId });
    assert.equal(res.ok, true);
    assert.equal(await inRoom(`project:${projectId}`, socket), false);

    const bad = await emit(socket, 'room.leave', { type: 'user', userId: alice.id });
    assert.equal(bad.error.code, 'VALIDATION_ERROR');
    assert.equal(await inRoom(`user:${alice.id}`, socket), true);
  });

  test('a join followed immediately by a leave never leaves the socket in the room', async () => {
    const socket = await connected(alice.cookie);
    const joined = emit(socket, 'room.join', { type: 'project', workspaceId, projectId });
    const left = emit(socket, 'room.leave', { type: 'project', projectId });
    await Promise.all([joined, left]);
    assert.equal(await inRoom(`project:${projectId}`, socket), false);
  });

  test('removing a guest from a project team removes them from its room', async () => {
    const add = await owner.agent.post(`/api/workspaces/${workspaceId}/projects/${projectId}/members`).send({ userId: carol.id });
    assert.equal(add.status, 201);

    const socket = await connected(carol.cookie);
    const joined = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });
    assert.equal(joined.ok, true);

    const changed = waitFor(socket, 'access.changed');
    const del = await owner.agent.delete(`/api/workspaces/${workspaceId}/projects/${projectId}/members/${carol.id}`);
    assert.equal(del.status, 200);
    const [payload] = await changed;
    assert.equal(payload.workspaceId, workspaceId);
    assert.equal(await inRoom(`project:${projectId}`, socket), false);

    const again = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });
    assert.equal(again.error.code, 'PROJECT_NOT_FOUND');
  });

  test('demoting a member to guest removes them from project rooms they are not on', async () => {
    const socket = await connected(bob.cookie);
    await emit(socket, 'room.join', { type: 'workspace', workspaceId });
    await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });

    const changed = waitFor(socket, 'access.changed');
    const res = await owner.agent.patch(`/api/workspaces/${workspaceId}/members/${bob.id}`).send({ role: 'guest' });
    assert.equal(res.status, 200);
    await changed;

    assert.equal(await inRoom(`project:${projectId}`, socket), false);
    assert.equal(await inRoom(`workspace:${workspaceId}`, socket), true);
  });

  test('removing a member from the workspace removes them from every room', async () => {
    const socket = await connected(alice.cookie);
    await emit(socket, 'room.join', { type: 'workspace', workspaceId });
    await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });

    const changed = waitFor(socket, 'access.changed');
    const res = await owner.agent.delete(`/api/workspaces/${workspaceId}/members/${alice.id}`);
    assert.equal(res.status, 200);
    await changed;

    assert.equal(await inRoom(`workspace:${workspaceId}`, socket), false);
    assert.equal(await inRoom(`project:${projectId}`, socket), false);
    const again = await emit(socket, 'room.join', { type: 'workspace', workspaceId });
    assert.equal(again.error.code, 'WORKSPACE_NOT_FOUND');
  });

  test('deleting a project closes its room', async () => {
    const created = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Short lived' });
    assert.equal(created.status, 201);
    const pid = created.body.data.project.id;

    const socket = await connected(owner.cookie);
    const joined = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId: pid });
    assert.equal(joined.ok, true);

    const changed = waitFor(socket, 'access.changed');
    const del = await owner.agent.delete(`/api/workspaces/${workspaceId}/projects/${pid}`);
    assert.equal(del.status, 200);
    await changed;
    assert.equal(await inRoom(`project:${pid}`, socket), false);
  });

  test('deleting a workspace closes its rooms and notifies members', async () => {
    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Doomed' });
    assert.equal(ws.status, 201);
    const wid = ws.body.data.workspace.id;
    const p = await owner.agent.post(`/api/workspaces/${wid}/projects`).send({ name: 'Doomed project' });
    assert.equal(p.status, 201);
    const pid = p.body.data.project.id;

    const socket = await connected(owner.cookie);
    assert.equal((await emit(socket, 'room.join', { type: 'workspace', workspaceId: wid })).ok, true);
    assert.equal((await emit(socket, 'room.join', { type: 'project', workspaceId: wid, projectId: pid })).ok, true);

    const changed = waitFor(socket, 'access.changed');
    const del = await owner.agent.delete(`/api/workspaces/${wid}`);
    assert.equal(del.status, 200);
    await changed;
    assert.equal(await inRoom(`workspace:${wid}`, socket), false);
    assert.equal(await inRoom(`project:${pid}`, socket), false);
  });

  test('event spam is rate limited and persistent abusers are disconnected', async () => {
    const socket = await connected(erin.cookie);
    const acks = [];
    const gone = waitFor(socket, 'disconnect', 5000);
    for (let i = 0; i < 200; i += 1) {
      socket.emit('room.leave', { type: 'project', projectId }, (response) => acks.push(response));
    }
    await gone;
    assert.equal(socket.connected, false);
    assert.ok(acks.some((r) => r.error?.code === 'RATE_LIMITED'));
  });

  test('the connection ends when the access token expires', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3;
    const cookie = `access_token=${jwt.sign({ sub: erin.id, exp }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' })}`;
    const socket = await connected(cookie);
    await waitFor(socket, 'disconnect', 6000);
    assert.equal(socket.connected, false);
  });

  test('a user cannot hold more than 10 connections at once', async () => {
    const opened = [];
    for (let i = 0; i < 10; i += 1) opened.push(await connected(dave.cookie));

    const { error } = await open(dave.cookie);
    assert.equal(error?.data?.code, 'TOO_MANY_CONNECTIONS');

    opened[0].disconnect();
    await until(async () => (await io.in(`user:${dave.id}`).fetchSockets()).length === 9);
    const again = await connected(dave.cookie);
    assert.equal(again.connected, true);
  });

  test('oversized messages close the connection', async () => {
    const socket = await connected(owner.cookie);
    const gone = waitFor(socket, 'disconnect', 5000);
    socket.emit('room.join', { type: 'workspace', workspaceId: 'a'.repeat(50_000) });
    await gone;
    assert.equal(socket.connected, false);
  });
});