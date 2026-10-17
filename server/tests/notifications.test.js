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
import { Notification } from '../src/modules/notification/notification.model.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('notifications (API + realtime)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  const clients = [];
  let httpServer, io, baseUrl;
  let owner, member, outsider;
  let workspaceId, projectId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@notifications-test.example`;
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

  async function list(user, { before, limit, unread } = {}) {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (limit) params.set('limit', String(limit));
    if (unread) params.set('unread', 'true');
    const qs = params.toString();
    const res = await user.agent.get(`/api/notifications${qs ? `?${qs}` : ''}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
  }

  const taskUrl = () => `/api/workspaces/${workspaceId}/projects/${projectId}/tasks`;
  const commentsUrl = (taskId) => `${taskUrl()}/${taskId}/comments`;

  async function createTask(body) {
    const res = await owner.agent.post(taskUrl()).send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.task;
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

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Notify Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const project = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Signals' });
    assert.equal(project.status, 201);
    projectId = project.body.data.project.id;

    await join(member, 'member');
  });

  after(async () => {
    for (const client of clients) client.disconnect();
    if (io) await new Promise((resolve) => io.close(resolve));

    const users = await User.find({ email: /@notifications-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const workspaces = await Workspace.find({ ownerId: { $in: ids } }).select('_id');
    const wsIds = workspaces.map((w) => w._id);
    await Notification.deleteMany({ recipientId: { $in: ids } });
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

  test('accepting an invite tells the inviter', async () => {
    const inbox = await list(owner);
    const accepted = inbox.notifications.filter((n) => n.type === 'invite.accepted');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].actor.name, 'member User');
    assert.equal(accepted[0].actorId, member.id);
    assert.equal(accepted[0].meta.workspaceName, 'Notify Team');
    assert.equal(accepted[0].readAt, null); // fresh notifications start unread
    assert.equal(inbox.unreadCount, 1);

    // Accepting your own invite gesture is not self-notified
    const memberInbox = await list(member);
    assert.equal(memberInbox.notifications.filter((n) => n.type === 'invite.accepted').length, 0);
  });

  test('adding someone to a project team notifies them', async () => {
    const res = await owner.agent
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/members`)
      .send({ userId: member.id });
    assert.equal(res.status, 201);

    const inbox = await list(member);
    assert.equal(inbox.notifications.length, 1);
    const [notification] = inbox.notifications;
    assert.equal(notification.type, 'project.member_added');
    assert.equal(notification.actor.name, 'owner User');
    assert.equal(notification.projectId, projectId);
    assert.equal(notification.meta.projectName, 'Signals');
  });

  test('assigning a task notifies the assignee, never the actor', async () => {
    const assigned = await createTask({ title: 'Ship the release', assigneeId: member.id });
    let inbox = await list(member);
    const assignment = inbox.notifications.find((n) => n.type === 'task.assigned');
    assert.equal(assignment.taskId, assigned.id);
    assert.equal(assignment.meta.taskTitle, 'Ship the release');
    assert.equal(assignment.actor.name, 'owner User');

    // Self-assignment produces nothing
    await createTask({ title: 'My own chores', assigneeId: owner.id });
    const ownerInbox = await list(owner);
    assert.equal(ownerInbox.notifications.filter((n) => n.type === 'task.assigned').length, 0);

    // Re-assigning to the same person is not a change
    const unassigned = await createTask({ title: 'Later work' });
    const first = await owner.agent.patch(`${taskUrl()}/${unassigned.id}`).send({ version: 1, assigneeId: member.id });
    assert.equal(first.status, 200);
    const before = (await list(member)).unreadCount;
    const same = await owner.agent
      .patch(`${taskUrl()}/${unassigned.id}`)
      .send({ version: first.body.data.task.version, assigneeId: member.id });
    assert.equal(same.status, 200);
    assert.equal((await list(member)).unreadCount, before);
  });

  test('comments on an assigned task notify the assignee, not the author of the comment', async () => {
    const assigned = (await list(member)).notifications.find(
      (n) => n.type === 'task.assigned' && n.meta.taskTitle === 'Ship the release'
    );
    assert.ok(assigned);

    const res = await owner.agent.post(commentsUrl(assigned.taskId)).send({ body: 'Any progress?' });
    assert.equal(res.status, 201);

    const inbox = await list(member);
    const comment = inbox.notifications.find((n) => n.type === 'comment.created');
    assert.equal(comment.taskId, assigned.taskId);
    assert.equal(comment.meta.taskTitle, 'Ship the release');
    assert.equal(comment.meta.excerpt, 'Any progress?');
    assert.equal(comment.actor.name, 'owner User');

    // The assignee commenting on their own task is not self-notified
    const before = inbox.unreadCount;
    const own = await member.agent.post(commentsUrl(assigned.taskId)).send({ body: 'Almost done' });
    assert.equal(own.status, 201);
    assert.equal((await list(member)).unreadCount, before);

    // An unassigned task has nobody to tell
    const quiet = await createTask({ title: 'Nobody owns me' });
    const ownerBefore = (await list(owner)).unreadCount;
    const memberBefore = (await list(member)).unreadCount;
    const posted = await owner.agent.post(commentsUrl(quiet.id)).send({ body: 'Hello?' });
    assert.equal(posted.status, 201);
    assert.equal((await list(owner)).unreadCount, ownerBefore);
    assert.equal((await list(member)).unreadCount, memberBefore);
  });

  test('the inbox is newest first, support cursors, and only count unread when asked', async () => {
    const all = await list(member);
    assert.ok(all.notifications.length >= 4, `expected at least 4, got ${all.notifications.length}`);
    assert.equal(all.unreadCount, all.notifications.length); // nothing was read yet

    // Newest first: ids are generated in order, so they descend
    for (let i = 1; i < all.notifications.length; i += 1) {
      assert.ok(all.notifications[i - 1].id > all.notifications[i].id);
    }

    const page1 = await list(member, { limit: 2 });
    assert.equal(page1.notifications.length, 2);
    assert.equal(page1.hasMore, true);
    assert.deepEqual(page1.notifications.map((n) => n.id), all.notifications.slice(0, 2).map((n) => n.id));

    const page2 = await list(member, { limit: 2, before: page1.notifications.at(-1).id });
    assert.equal(page2.hasMore, false);
    assert.deepEqual(page2.notifications.map((n) => n.id), all.notifications.slice(2).map((n) => n.id));

    const unreadOnly = await list(member, { unread: true });
    assert.equal(unreadOnly.notifications.length, all.unreadCount);
    assert.ok(unreadOnly.notifications.every((n) => n.readAt === null));

    const anon = await request(app).get('/api/notifications');
    assert.equal(anon.status, 401);
  });

  test('reading one is idempotent; read-all clears the count; strangers get 404', async () => {
    const start = await list(member);
    const oldest = start.notifications.at(-1);

    const first = await member.agent.patch(`/api/notifications/${oldest.id}/read`);
    assert.equal(first.status, 200);
    const readAt = first.body.data.notification.readAt;
    assert.ok(readAt);

    const again = await member.agent.patch(`/api/notifications/${oldest.id}/read`);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.notification.readAt, readAt); // idempotent

    const afterOne = await list(member);
    assert.equal(afterOne.unreadCount, start.unreadCount - 1);

    // Someone else's notification is not even acknowledged
    const denied = await outsider.agent.patch(`/api/notifications/${oldest.id}/read`);
    assert.equal(denied.status, 404);
    assert.equal(denied.body.error.code, 'NOTIFICATION_NOT_FOUND');

    const all = await member.agent.post('/api/notifications/read-all');
    assert.equal(all.status, 200);
    assert.ok(all.body.data.updated >= 1);
    const cleared = await list(member);
    assert.equal(cleared.unreadCount, 0);
    assert.ok(cleared.notifications.every((n) => n.readAt));

    const ownerAll = await owner.agent.post('/api/notifications/read-all');
    assert.equal(ownerAll.status, 200);
    assert.equal((await list(owner)).unreadCount, 0);
  });

  test('notification.created reaches only the recipient user room', async () => {
    const memberSocket = await connected(member.cookie);
    const outsiderSocket = await connected(outsider.cookie);
    const received = collect(memberSocket, 'notification.created');
    const silence = collect(outsiderSocket, 'notification.created');

    const arriving = waitFor(memberSocket, 'notification.created');
    const task = await createTask({ title: 'Live assignment', assigneeId: member.id });

    const [payload] = await arriving;
    assert.equal(payload.notification.type, 'task.assigned');
    assert.equal(payload.notification.taskId, task.id);
    assert.equal(payload.notification.actor.name, 'owner User');
    assert.equal(payload.notification.readAt, null);

    await settle();
    assert.equal(received.length, 1);
    assert.deepEqual(silence, []); // nobody outside the recipient's room hears it
  });

  test('deleting tasks, projects and workspaces takes the notifications with them', async () => {
    const task = await createTask({ title: 'Doomed task', assigneeId: member.id });
    const inbox = await list(member);
    const created = inbox.notifications.find((n) => n.taskId === task.id);
    assert.ok(created);

    const removed = await owner.agent.delete(`${taskUrl()}/${task.id}`);
    assert.equal(removed.status, 200);
    assert.equal(await Notification.countDocuments({ _id: created.id }), 0);

    // Project deletion: make a project-scoped notification first
    const second = await owner.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name: 'Temporary' });
    const secondId = second.body.data.project.id;
    const added = await owner.agent
      .post(`/api/workspaces/${workspaceId}/projects/${secondId}/members`)
      .send({ userId: member.id });
    assert.equal(added.status, 201);
    assert.ok((await Notification.countDocuments({ recipientId: member.id, projectId: secondId })) > 0);

    const deleted = await owner.agent.delete(`/api/workspaces/${workspaceId}/projects/${secondId}`);
    assert.equal(deleted.status, 200);
    assert.equal(await Notification.countDocuments({ projectId: secondId }), 0);

    // Workspace deletion clears whatever is left for its members
    assert.ok((await Notification.countDocuments({ workspaceId })) > 0);
    const gone = await owner.agent.delete(`/api/workspaces/${workspaceId}`);
    assert.equal(gone.status, 200);
    assert.equal(await Notification.countDocuments({ workspaceId }), 0);
  });
});
