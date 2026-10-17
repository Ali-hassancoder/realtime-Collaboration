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
import { Task } from '../src/modules/task/task.model.js';
import { Comment } from '../src/modules/comment/comment.model.js';
import { Activity } from '../src/modules/activity/activity.model.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('comments (API + realtime)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, outsider;
  let workspaceId, projectId, taskId, otherTaskId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@comments-test.example`;
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

  async function watcher(user, type = 'project') {
    const socket = await connected(user.cookie);
    const payload = type === 'project' ? { type, workspaceId, projectId } : { type, workspaceId };
    const res = await emit(socket, 'room.join', payload);
    assert.equal(res.ok, true);
    return socket;
  }

  const taskUrl = () => `/api/workspaces/${workspaceId}/projects/${projectId}/tasks`;
  const commentsUrl = (t = taskId) => `${taskUrl()}/${t}/comments`;
  const projectUrl = () => `/api/workspaces/${workspaceId}/projects/${projectId}`;

  const post = (agent, body = 'A comment', t = taskId) => agent.post(commentsUrl(t)).send({ body });

  async function listComments(user, { before, limit } = {}) {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await user.agent.get(`${commentsUrl()}${qs ? `?${qs}` : ''}`);
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

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Comments Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Threads' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(member, 'member');

    const task = await owner.agent.post(taskUrl()).send({ title: 'Discuss me' });
    assert.equal(task.status, 201);
    taskId = task.body.data.task.id;

    const other = await owner.agent.post(taskUrl()).send({ title: 'Another task' });
    assert.equal(other.status, 201);
    otherTaskId = other.body.data.task.id;
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@comments-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
    await Comment.deleteMany({ workspaceId: { $in: wsIds } });
    await Activity.deleteMany({ workspaceId: { $in: wsIds } });
    await Task.deleteMany({ workspaceId: { $in: wsIds } });
    await ProjectMember.deleteMany({ workspaceId: { $in: wsIds } });
    await Project.deleteMany({ workspaceId: { $in: wsIds } });
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  let firstId; // reused by later tests

  test('a comment is created, listed, and streamed with an activity entry', async () => {
    const socket = await watcher(member);
    const created = waitFor(socket, 'comment.created');
    const activity = waitFor(socket, 'activity.created');

    const res = await post(member.agent, 'First thought');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const comment = res.body.data.comment;
    assert.equal(comment.body, 'First thought');
    assert.equal(comment.authorId, member.id);
    assert.equal(comment.author.name, 'member User'); // the author name is embedded for display
    assert.equal(comment.version, 1);
    assert.equal(comment.taskId, taskId);
    firstId = comment.id;

    const [payload] = await created;
    assert.equal(payload.actorId, member.id); // the acting client also gets its own echo (and ignores it)
    assert.equal(payload.comment.id, comment.id);
    assert.equal(payload.comment.author.name, 'member User');

    const [activityPayload] = await activity;
    assert.equal(activityPayload.activity.type, 'comment.created');
    assert.equal(activityPayload.activity.taskId, taskId);
    assert.equal(activityPayload.activity.meta.taskTitle, 'Discuss me');
    assert.equal(activityPayload.activity.meta.excerpt, 'First thought');
    assert.equal(activityPayload.activity.actor.name, 'member User');

    const data = await listComments(owner);
    assert.equal(data.comments.length, 1);
    assert.equal(data.hasMore, false);
    assert.equal(data.comments[0].id, comment.id);
  });

  test('the thread is paginated oldest-to-newest and the cursor walks back', async () => {
    for (const body of ['Second', 'Third', 'Fourth']) {
      const res = await post(member.agent, body);
      assert.equal(res.status, 201);
    }

    const all = await listComments(owner);
    assert.deepEqual(all.comments.map((c) => c.body), ['First thought', 'Second', 'Third', 'Fourth']);
    assert.equal(all.hasMore, false);

    // A smaller page returns the newest comments in chronological order
    const page1 = await listComments(owner, { limit: 2 });
    assert.deepEqual(page1.comments.map((c) => c.body), ['Third', 'Fourth']);
    assert.equal(page1.hasMore, true);

    const page2 = await listComments(owner, { limit: 2, before: page1.comments[0].id });
    assert.deepEqual(page2.comments.map((c) => c.body), ['First thought', 'Second']);
    assert.equal(page2.hasMore, false);
  });

  test('only the author may edit; a stale version is rejected with 409', async () => {
    const fourth = (await listComments(owner)).comments.find((c) => c.body === 'Fourth');
    const socket = await watcher(owner);

    const updated = waitFor(socket, 'comment.updated');
    const res = await member.agent
      .patch(`${commentsUrl()}/${fourth.id}`)
      .send({ version: fourth.version, body: 'Fourth, edited' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.comment.body, 'Fourth, edited');
    assert.equal(res.body.data.comment.version, fourth.version + 1);

    const [payload] = await updated;
    assert.equal(payload.actorId, member.id);
    assert.equal(payload.comment.body, 'Fourth, edited');

    // The owner is not the author: editing is refused even for a manager
    const denied = await owner.agent
      .patch(`${commentsUrl()}/${fourth.id}`)
      .send({ version: fourth.version + 1, body: 'Not mine to edit' });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');

    // The old version no longer matches: the conflict carries the current copy
    const stale = await member.agent
      .patch(`${commentsUrl()}/${fourth.id}`)
      .send({ version: fourth.version, body: 'Race me' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'COMMENT_VERSION_CONFLICT');
    assert.equal(stale.body.error.details.current.body, 'Fourth, edited');
  });

  test('managers may delete any comment; members only their own', async () => {
    const fourth = (await listComments(owner)).comments.find((c) => c.body === 'Fourth, edited');
    const socket = await watcher(member);

    const deleted = waitFor(socket, 'comment.deleted');
    const res = await member.agent.delete(`${commentsUrl()}/${fourth.id}`);
    assert.equal(res.status, 200);

    const [payload] = await deleted;
    assert.equal(payload.commentId, fourth.id);
    assert.equal(payload.taskId, taskId);
    assert.equal(payload.actorId, member.id);

    // The owner writes a comment; the member may not delete it
    const mine = await post(owner.agent, 'Owner note');
    assert.equal(mine.status, 201);
    const denied = await member.agent.delete(`${commentsUrl()}/${mine.body.data.comment.id}`);
    assert.equal(denied.status, 403);

    // …but the owner (a manager+) may delete any comment, including their own
    const allowed = await owner.agent.delete(`${commentsUrl()}/${mine.body.data.comment.id}`);
    assert.equal(allowed.status, 200);
  });

  test('comments from another task are unreachable and bad input is rejected', async () => {
    const some = (await listComments(owner)).comments[0];
    assert.equal(some.id, firstId);

    const crossTask = await owner.agent
      .patch(`${commentsUrl(otherTaskId)}/${some.id}`)
      .send({ version: some.version, body: 'Wrong thread' });
    assert.equal(crossTask.status, 404);
    assert.equal(crossTask.body.error.code, 'COMMENT_NOT_FOUND');

    const missing = await owner.agent.delete(`${commentsUrl()}/aaaaaaaaaaaaaaaaaaaaaaaa`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'COMMENT_NOT_FOUND');

    const empty = await post(member.agent, '   ');
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR');

    const tooLong = await post(member.agent, 'x'.repeat(2001));
    assert.equal(tooLong.status, 400);
  });

  test('comment events stay inside the project room', async () => {
    const workspaceSocket = await watcher(owner, 'workspace'); // the workspace room is not enough
    const outsiderSocket = await connected(outsider.cookie);
    const memberSocket = await watcher(member);

    const seen = [collect(workspaceSocket, 'comment.created'), collect(outsiderSocket, 'comment.created')];
    const synced = waitFor(memberSocket, 'comment.created');
    const res = await post(member.agent, 'Only for the room');
    assert.equal(res.status, 201);

    const [payload] = await synced;
    assert.equal(payload.comment.body, 'Only for the room');
    await settle();
    assert.deepEqual(seen[0], []);
    assert.deepEqual(seen[1], []);
  });

  test('an archived project rejects new comments but still serves the thread', async () => {
    const arch = await owner.agent.patch(projectUrl()).send({ status: 'archived' });
    assert.equal(arch.status, 200);

    const denied = await post(member.agent, 'Still talking?');
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error.code, 'PROJECT_ARCHIVED');

    const readable = await listComments(member);
    assert.equal(readable.comments.at(-1).body, 'Only for the room');
  });
});
