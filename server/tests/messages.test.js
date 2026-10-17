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
import { Message } from '../src/modules/message/message.model.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('messages (API + realtime)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, outsider;
  let workspaceId, projectId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@messages-test.example`;
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

  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

  async function watcher(user) {
    const socket = await connected(user.cookie);
    const res = await emit(socket, 'room.join', { type: 'project', workspaceId, projectId });
    assert.equal(res.ok, true);
    return socket;
  }

  const messagesUrl = (p = projectId) => `/api/workspaces/${workspaceId}/projects/${p}/messages`;
  const projectUrl = (p = projectId) => `/api/workspaces/${workspaceId}/projects/${p}`;

  const post = (agent, body, p = projectId) => agent.post(messagesUrl(p)).send({ body });

  async function listMessages(user, { before, limit, p = projectId } = {}) {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await user.agent.get(`${messagesUrl(p)}${qs ? `?${qs}` : ''}`);
    assert.equal(res.status, 200);
    return res.body.data;
  }

  before(async () => {
    await mongoose.connect(testUri);
    httpServer = http.createServer(app);
    io = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

    owner = await registerAgent('owner');
    member = await registerAgent('member');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Chat Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Chatter' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(member, 'member');
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@messages-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
    await Message.deleteMany({ workspaceId: { $in: wsIds } });
    await ProjectMember.deleteMany({ workspaceId: { $in: wsIds } });
    await Project.deleteMany({ workspaceId: { $in: wsIds } });
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  test('a message is created, listed, and streamed to the project room', async () => {
    const socket = await watcher(owner);
    const outsiderSocket = await connected(outsider.cookie);
    const silence = collect(outsiderSocket, 'message.created');

    const created = waitFor(socket, 'message.created');
    const res = await post(member.agent, 'Hello team');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const message = res.body.data.message;
    assert.equal(message.body, 'Hello team');
    assert.equal(message.authorId, member.id);
    assert.equal(message.author.name, 'member User'); // the author name is embedded for display
    assert.equal(message.version, 1);
    assert.equal(message.projectId, projectId);

    const [payload] = await created;
    assert.equal(payload.actorId, member.id); // the acting client also gets its own echo (and ignores it)
    assert.equal(payload.message.id, message.id);
    assert.equal(payload.message.author.name, 'member User');

    const data = await listMessages(owner);
    assert.deepEqual(data.messages.map((m) => m.body), ['Hello team']);
    assert.equal(data.hasMore, false);

    await settle();
    assert.deepEqual(silence, []); // chat never leaves the project room
  });

  test('chat is paginated oldest-to-newest and the cursor walks back', async () => {
    for (const body of ['Second', 'Third', 'Fourth']) {
      const res = await post(member.agent, body);
      assert.equal(res.status, 201);
    }

    const all = await listMessages(owner);
    assert.deepEqual(all.messages.map((m) => m.body), ['Hello team', 'Second', 'Third', 'Fourth']);

    const page1 = await listMessages(owner, { limit: 2 });
    assert.deepEqual(page1.messages.map((m) => m.body), ['Third', 'Fourth']);
    assert.equal(page1.hasMore, true);

    const page2 = await listMessages(owner, { limit: 2, before: page1.messages[0].id });
    assert.deepEqual(page2.messages.map((m) => m.body), ['Hello team', 'Second']);
    assert.equal(page2.hasMore, false);
  });

  test('only the author may edit; a stale version is rejected with 409', async () => {
    const fourth = (await listMessages(owner)).messages.find((m) => m.body === 'Fourth');
    const socket = await watcher(owner);

    const updated = waitFor(socket, 'message.updated');
    const res = await member.agent
      .patch(`${messagesUrl()}/${fourth.id}`)
      .send({ version: fourth.version, body: 'Fourth, edited' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.message.body, 'Fourth, edited');
    assert.equal(res.body.data.message.version, fourth.version + 1);

    const [payload] = await updated;
    assert.equal(payload.actorId, member.id);
    assert.equal(payload.message.body, 'Fourth, edited');

    // The owner did not write it: editing is refused even for an admin
    const denied = await owner.agent
      .patch(`${messagesUrl()}/${fourth.id}`)
      .send({ version: fourth.version + 1, body: 'Not mine to edit' });
    assert.equal(denied.status, 403);

    // The old version no longer matches: the conflict carries the current copy
    const stale = await member.agent
      .patch(`${messagesUrl()}/${fourth.id}`)
      .send({ version: fourth.version, body: 'Race me' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'MESSAGE_VERSION_CONFLICT');
    assert.equal(stale.body.error.details.current.body, 'Fourth, edited');
  });

  test('authors delete their own; admins may delete any', async () => {
    const fourth = (await listMessages(owner)).messages.find((m) => m.body === 'Fourth, edited');
    const socket = await watcher(member);

    const deleted = waitFor(socket, 'message.deleted');
    const res = await member.agent.delete(`${messagesUrl()}/${fourth.id}`);
    assert.equal(res.status, 200);

    const [payload] = await deleted;
    assert.equal(payload.messageId, fourth.id);
    assert.equal(payload.actorId, member.id);
    assert.equal(payload.message, undefined); // the id is all the client needs

    // The owner writes a message; the member may not delete it
    const mine = await post(owner.agent, 'Owner message');
    assert.equal(mine.status, 201);
    const denied = await member.agent.delete(`${messagesUrl()}/${mine.body.data.message.id}`);
    assert.equal(denied.status, 403);

    // …but the owner (an admin) may delete any message, including the member's
    const second = (await listMessages(owner)).messages.find((m) => m.body === 'Second');
    const allowed = await owner.agent.delete(`${messagesUrl()}/${second.id}`);
    assert.equal(allowed.status, 200);
  });

  test('messages from another project are unreachable and bad input is rejected', async () => {
    const other = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Elsewhere' });
    assert.equal(other.status, 201);
    const otherProjectId = other.body.data.project.id;

    const away = await post(owner.agent, 'Other room', otherProjectId);
    assert.equal(away.status, 201);
    const awayId = away.body.data.message.id;

    const crossProject = await owner.agent
      .patch(`${messagesUrl()}/${awayId}`)
      .send({ version: 1, body: 'Wrong room' });
    assert.equal(crossProject.status, 404);
    assert.equal(crossProject.body.error.code, 'MESSAGE_NOT_FOUND');

    const missing = await owner.agent.delete(`${messagesUrl()}/aaaaaaaaaaaaaaaaaaaaaaaa`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'MESSAGE_NOT_FOUND');

    const empty = await post(member.agent, '   ');
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR');

    const tooLong = await post(member.agent, 'x'.repeat(2001));
    assert.equal(tooLong.status, 400);
  });

  test('an archived project rejects new messages but still serves the chat', async () => {
    const arch = await owner.agent.patch(projectUrl()).send({ status: 'archived' });
    assert.equal(arch.status, 200);

    const denied = await post(member.agent, 'Still chatting?');
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error.code, 'PROJECT_ARCHIVED');

    const readable = await listMessages(member);
    assert.equal(readable.messages.at(-1).body, 'Owner message');
  });
});
