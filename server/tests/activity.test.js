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

describe('activity feed (API + realtime)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, outsider;
  let workspaceId, projectId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@activity-test.example`;
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

  const taskUrl = () => `/api/workspaces/${workspaceId}/projects/${projectId}/tasks`;
  const activityUrl = () => `/api/workspaces/${workspaceId}/projects/${projectId}/activity`;

  async function feed({ before, limit = 100 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    const res = await owner.agent.get(`${activityUrl()}?${params}`);
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

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Activity Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Happenings' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(member, 'member');

    // A baseline entry, created before any watcher connects
    const base = await owner.agent.post(taskUrl()).send({ title: 'Base task' });
    assert.equal(base.status, 201);
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@activity-test\.example$/ }).select('_id');
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

  let task; // the task the lifecycle tests drive

  test('task creates, edits and moves stream to the feed with descriptive meta', async () => {
    const socket = await watcher(owner);
    const outsiderSocket = await connected(outsider.cookie);
    const silence = collect(outsiderSocket, 'activity.created');

    // Create
    const created = waitFor(socket, 'activity.created');
    const res = await member.agent.post(taskUrl()).send({ title: 'Feed me', priority: 'high' });
    assert.equal(res.status, 201);
    task = res.body.data.task;

    const [createdPayload] = await created;
    assert.equal(createdPayload.activity.type, 'task.created');
    assert.equal(createdPayload.activity.actor.name, 'member User');
    assert.equal(createdPayload.activity.actorId, member.id);
    assert.equal(createdPayload.activity.taskId, task.id);
    assert.equal(createdPayload.activity.meta.title, 'Feed me');

    // Edit: only the touched fields are listed (version is concurrency control, not an edit)
    const updated = waitFor(socket, 'activity.created');
    const patched = await member.agent
      .patch(`${taskUrl()}/${task.id}`)
      .send({ version: task.version, priority: 'urgent' });
    assert.equal(patched.status, 200);
    task = patched.body.data.task;

    const [updatedPayload] = await updated;
    assert.equal(updatedPayload.activity.type, 'task.updated');
    assert.deepEqual(updatedPayload.activity.meta.fields, ['priority']);
    assert.equal(updatedPayload.activity.meta.title, 'Feed me');

    // Move: from/to columns travel with the entry
    const moved = waitFor(socket, 'activity.created');
    const move = await member.agent
      .post(`${taskUrl()}/${task.id}/move`)
      .send({ version: task.version, status: 'in_progress' });
    assert.equal(move.status, 200);
    task = move.body.data.task;

    const [movedPayload] = await moved;
    assert.equal(movedPayload.activity.type, 'task.moved');
    assert.equal(movedPayload.activity.meta.from, 'todo');
    assert.equal(movedPayload.activity.meta.to, 'in_progress');

    await settle();
    assert.deepEqual(silence, []); // the feed never leaves the project room
  });

  test('a comment entry carries the task title and a 140-char excerpt', async () => {
    const res = await member.agent.post(`${taskUrl()}/${task.id}/comments`).send({ body: 'y'.repeat(150) });
    assert.equal(res.status, 201);

    const data = await feed();
    const entry = data.activities.find((a) => a.type === 'comment.created');
    assert.equal(entry.taskId, task.id);
    assert.equal(entry.meta.taskTitle, 'Feed me');
    assert.equal(entry.meta.excerpt.length, 143); // 140 characters plus the ellipsis
    assert.equal(entry.actor.name, 'member User');
  });

  test('the feed pages newest-first with the before cursor', async () => {
    const all = await feed();
    const total = all.activities.length;
    assert.ok(total > 2, `expected several entries, found ${total}`);

    const page1 = await feed({ limit: 2 });
    assert.equal(page1.activities.length, 2);
    assert.equal(page1.hasMore, true);

    const page2 = await feed({ limit: 100, before: page1.activities[1].id });
    assert.equal(page2.activities.length, total - 2);
    assert.equal(page2.hasMore, false);

    // Newest first: ids descend across the whole feed
    const ids = [...page1.activities, ...page2.activities].map((a) => a.id);
    for (let i = 1; i < ids.length; i += 1) {
      assert.ok(ids[i - 1] > ids[i], 'entries must descend by id (newest first)');
    }
  });

  test('deleting a task cascades its comments and history, keeping only the deletion entry', async () => {
    const socket = await watcher(owner);
    const live = waitFor(socket, 'activity.created');

    const res = await owner.agent.delete(`${taskUrl()}/${task.id}`);
    assert.equal(res.status, 200);

    const [payload] = await live;
    assert.equal(payload.activity.type, 'task.deleted');
    assert.equal(payload.activity.taskId, null); // the task is gone, the entry stands alone
    assert.equal(payload.activity.meta.title, 'Feed me');

    // The task's comments are gone with it…
    assert.equal(await Comment.countDocuments({ taskId: task.id }), 0);
    // …and so is every feed entry that referenced it
    const data = await feed();
    assert.equal(data.activities.some((a) => a.taskId === task.id), false);
    assert.deepEqual(data.activities.map((a) => a.type), ['task.deleted', 'task.created']); // newest first
    assert.equal(data.activities.at(-1).meta.title, 'Base task');
  });
});
