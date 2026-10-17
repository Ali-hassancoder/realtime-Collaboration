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

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('task realtime events', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, editor, guest, outsider;
  let workspaceId, projectId, taskId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@task-events-test.example`;
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

  // Records every event the socket receives, for "must not arrive" assertions
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

  const board = async (user) => {
    const res = await user.agent.get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks/board`);
    assert.equal(res.status, 200);
    return res.body.data.columns;
  };

  before(async () => {
    await mongoose.connect(testUri);
    httpServer = http.createServer(app);
    io = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

    owner = await registerAgent('owner');
    editor = await registerAgent('editor');
    guest = await registerAgent('guest');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Realtime Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Sync Project' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(editor, 'member');
    await join(guest, 'guest');
    const addGuest = await owner.agent
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/members`)
      .send({ userId: guest.id });
    assert.equal(addGuest.status, 201);
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@task-events-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
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

  test('a created task reaches everyone in the project room with its full payload', async () => {
    const editorSocket = await watcher(editor);
    const guestSocket = await watcher(guest); // project-scoped guest is in the same room

    const forEditor = waitFor(editorSocket, 'task.created');
    const forGuest = waitFor(guestSocket, 'task.created');
    const res = await editor.agent
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .send({ title: 'Ship the sync', description: 'Details travel with the event', priority: 'high' });
    assert.equal(res.status, 201);
    taskId = res.body.data.task.id;

    const [payload] = await forEditor;
    assert.equal(payload.actorId, editor.id); // the acting client also gets its own echo (and ignores it)
    assert.equal(payload.task.id, taskId);
    assert.equal(payload.task.title, 'Ship the sync');
    assert.equal(payload.task.description, 'Details travel with the event');
    assert.equal(payload.task.status, 'todo');
    assert.equal(payload.task.priority, 'high');
    assert.equal(payload.task.version, 1);
    assert.equal(payload.task.projectId, projectId);

    const [guestPayload] = await forGuest;
    assert.equal(guestPayload.task.id, taskId);
    assert.equal(guestPayload.actorId, editor.id);
  });

  test('an edit is published as task.updated with the new version', async () => {
    const socket = await watcher(guest);
    const todo = (await board(editor)).todo;
    assert.equal(todo.tasks[0].id, taskId);

    const updated = waitFor(socket, 'task.updated');
    const res = await editor.agent
      .patch(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`)
      .send({ version: todo.tasks[0].version, title: 'Ship it today', status: 'in_review' });
    assert.equal(res.status, 200);

    const [payload] = await updated;
    assert.equal(payload.actorId, editor.id);
    assert.equal(payload.task.id, taskId);
    assert.equal(payload.task.title, 'Ship it today');
    assert.equal(payload.task.status, 'in_review'); // a status change also moves the task
    assert.equal(payload.task.version, todo.tasks[0].version + 1);
    assert.equal(typeof payload.task.position, 'number');
  });

  test('a move is published as task.updated', async () => {
    const socket = await watcher(editor);
    const task = (await board(editor)).in_review.tasks[0];
    assert.equal(task.id, taskId);

    const updated = waitFor(socket, 'task.updated');
    const res = await editor.agent
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/move`)
      .send({ version: task.version, status: 'done' });
    assert.equal(res.status, 200);

    const [payload] = await updated;
    assert.equal(payload.task.id, taskId);
    assert.equal(payload.task.status, 'done');
    assert.equal(payload.task.version, task.version + 1);
  });

  test('a deletion is published as task.deleted with the task id', async () => {
    const socket = await watcher(owner); // only a manager+ may delete

    const deleted = waitFor(socket, 'task.deleted');
    const res = await owner.agent.delete(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`);
    assert.equal(res.status, 200);

    const [payload] = await deleted;
    assert.equal(payload.taskId, taskId);
    assert.equal(payload.actorId, owner.id);
    assert.equal(payload.task, undefined); // the id is all the client needs

    const columns = await board(editor);
    assert.equal(Object.values(columns).every((c) => c.tasks.length === 0 && c.total === 0), true);
  });

  test('events stay inside the project room', async () => {
    // The workspace room is not enough, and outsiders receive nothing at all
    const workspaceSocket = await watcher(owner, 'workspace');
    const outsiderSocket = await connected(outsider.cookie);
    const editorSocket = await watcher(editor);

    const seen = [collect(workspaceSocket, 'task.created'), collect(outsiderSocket, 'task.created')];
    const synced = waitFor(editorSocket, 'task.created');
    const res = await editor.agent
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .send({ title: 'Only for the room' });
    assert.equal(res.status, 201);

    const [payload] = await synced;
    assert.equal(payload.task.title, 'Only for the room');
    await settle();
    assert.deepEqual(seen[0], []);
    assert.deepEqual(seen[1], []);
  });
});
