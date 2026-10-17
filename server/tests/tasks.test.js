import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/users.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { WorkspaceMember } from '../src/modules/workspaces/workspaceMember.model.js';
import { WorkspaceInvite } from '../src/modules/workspaces/workspaceInvite.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { ProjectMember } from '../src/modules/projects/projectMember.model.js';
import { Task } from '../src/modules/task/task.model.js';
import { STEP } from '../src/modules/task/task.ordering.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('tasks (API)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  let owner, manager, member, guest, outsider;
  let workspaceId, otherWorkspaceId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@tasks-test.example`;
    const res = await agent.post('/api/auth/register').send({ name: `${name} User`, email, password });
    assert.equal(res.status, 201);
    return { agent, email, id: res.body.data.user.id };
  }

  async function join(user, role) {
    const inv = await owner.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: user.email, role });
    assert.equal(inv.status, 201);
    const token = inv.body.data.inviteUrl.split('/').pop();
    const acc = await user.agent.post('/api/invites/accept').send({ token });
    assert.equal(acc.status, 200);
  }

  // A fresh project (creator = manager, who joins its team) so each test starts from an empty board
  async function newProject(name = 'Board') {
    const res = await manager.agent.post(`/api/workspaces/${workspaceId}/projects`).send({ name });
    assert.equal(res.status, 201);
    const id = res.body.data.project.id;
    const projectUrl = `/api/workspaces/${workspaceId}/projects/${id}`;
    return { id, projectUrl, url: `${projectUrl}/tasks` };
  }

  async function makeTask(p, title, extra = {}) {
    const res = await member.agent.post(p.url).send({ title, ...extra });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.task;
  }

  // Titles of a column, in board order
  async function column(p, status, agent = member.agent) {
    const res = await agent.get(`${p.url}/board`);
    assert.equal(res.status, 200);
    return res.body.data.columns[status].tasks.map((t) => t.title);
  }

  const move = (p, task, body, agent = member.agent) =>
    agent.post(`${p.url}/${task.id}/move`).send({ version: task.version, ...body });

  before(async () => {
    await mongoose.connect(testUri);
    owner = await registerAgent('owner');
    manager = await registerAgent('manager');
    member = await registerAgent('member');
    guest = await registerAgent('guest');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Tasks Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const other = await outsider.agent.post('/api/workspaces').send({ name: 'Other Team' });
    assert.equal(other.status, 201);
    otherWorkspaceId = other.body.data.workspace.id;

    await join(manager, 'manager');
    await join(member, 'member');
    await join(guest, 'guest');
  });

  after(async () => {
    const users = await User.find({ email: /@tasks-test\.example$/ }).select('_id');
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

  test('guests and outsiders cannot create tasks; an unassigned guest cannot see the board', async () => {
    const p = await newProject('Access');

    const hidden = await guest.agent.get(`${p.url}/board`);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.error.code, 'PROJECT_NOT_FOUND');

    const add = await manager.agent.post(`${p.projectUrl}/members`).send({ userId: guest.id });
    assert.equal(add.status, 201);
    const denied = await guest.agent.post(p.url).send({ title: 'Nope' });
    assert.equal(denied.status, 403);

    const stranger = await outsider.agent.post(p.url).send({ title: 'Nope' });
    assert.equal(stranger.status, 404);
    assert.equal(stranger.body.error.code, 'WORKSPACE_NOT_FOUND');
  });

  test('a member creates tasks; defaults and positions are assigned by the server', async () => {
    const p = await newProject('Create');
    const first = await makeTask(p, 'First');
    assert.equal(first.status, 'todo');
    assert.equal(first.priority, 'medium');
    assert.equal(first.version, 1);
    assert.equal(first.assigneeId, null);
    assert.equal(first.dueDate, null);
    assert.equal(first.position, STEP);
    assert.equal(first.createdBy, member.id);

    const second = await makeTask(p, 'Second', { priority: 'high' });
    assert.equal(second.priority, 'high');
    assert.equal(second.position, 2 * STEP);

    // Positions are per column
    const finished = await makeTask(p, 'Finished', { status: 'done' });
    assert.equal(finished.position, STEP);
  });

  test('rejects invalid task data', async () => {
    const p = await newProject('Validation');
    const bad = [
      {},
      { title: '' },
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { title: 'ok', description: 'x'.repeat(2001) },
      { title: 'ok', status: 'bogus' },
      { title: 'ok', priority: 'extreme' },
      { title: 'ok', assigneeId: 'not-an-id' },
    ];
    for (const body of bad) {
      const res = await member.agent.post(p.url).send(body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  test('due dates are calendar dates; impossible dates are rejected and dates can be cleared', async () => {
    const p = await newProject('Dates');
    const task = await makeTask(p, 'Due', { dueDate: '2026-12-31' });
    assert.equal(task.dueDate, '2026-12-31T00:00:00.000Z');

    for (const dueDate of ['2026-02-31', '2026-13-01', '31-12-2026', 'tomorrow']) {
      const res = await member.agent.post(p.url).send({ title: 'Bad date', dueDate });
      assert.equal(res.status, 400, dueDate);
    }

    const cleared = await member.agent.patch(`${p.url}/${task.id}`).send({ version: task.version, dueDate: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.task.dueDate, null);
  });

  test('the board lists columns in order without descriptions; a single task includes the description', async () => {
    const p = await newProject('Shape');
    await makeTask(p, 'With details', { description: 'secret details', priority: 'urgent' });

    const res = await member.agent.get(`${p.url}/board`);
    assert.equal(res.status, 200);
    const { columns } = res.body.data;
    assert.deepEqual(Object.keys(columns), ['todo', 'in_progress', 'in_review', 'done']);
    assert.equal(columns.todo.total, 1);
    assert.equal(columns.in_progress.total, 0);
    assert.deepEqual(columns.in_progress.tasks, []);

    const card = columns.todo.tasks[0];
    assert.equal(card.title, 'With details');
    assert.equal(card.description, undefined);

    const full = await member.agent.get(`${p.url}/${card.id}`);
    assert.equal(full.status, 200);
    assert.equal(full.body.data.task.description, 'secret details');

    const tooSmall = await member.agent.get(`${p.url}/board?limit=0`);
    assert.equal(tooSmall.status, 400);
  });

  test('updates bump the version; a stale version is rejected and nothing is overwritten', async () => {
    const p = await newProject('Versions');
    const task = await makeTask(p, 'Original');
    assert.equal(task.version, 1);

    const ok = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 1, title: 'Renamed' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.task.title, 'Renamed');
    assert.equal(ok.body.data.task.version, 2);

    const stale = await manager.agent.patch(`${p.url}/${task.id}`).send({ version: 1, title: 'Stale write' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'TASK_VERSION_CONFLICT');
    assert.equal(stale.body.error.details.current.title, 'Renamed');
    assert.equal(stale.body.error.details.current.version, 2);

    const check = await member.agent.get(`${p.url}/${task.id}`);
    assert.equal(check.body.data.task.title, 'Renamed');

    const noVersion = await member.agent.patch(`${p.url}/${task.id}`).send({ title: 'No version' });
    assert.equal(noVersion.status, 400);
  });

  test('clients cannot overwrite server-controlled fields', async () => {
    const p = await newProject('Mass assignment');
    const other = await newProject('Elsewhere');
    const task = await makeTask(p, 'Mine');

    const res = await member.agent.patch(`${p.url}/${task.id}`).send({
      version: 1,
      title: 'Renamed',
      position: 999999,
      projectId: other.id,
      workspaceId: otherWorkspaceId,
      createdBy: guest.id,
    });
    assert.equal(res.status, 200);
    const updated = res.body.data.task;
    assert.equal(updated.title, 'Renamed');
    assert.equal(updated.position, task.position);
    assert.equal(updated.projectId, p.id);
    assert.equal(updated.workspaceId, workspaceId);
    assert.equal(updated.createdBy, member.id);

    // A body with only server-controlled fields has nothing to change
    const only = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 2, position: 5 });
    assert.equal(only.status, 400);
  });

  test('assignees must be on the project team; leaving the team unassigns their tasks', async () => {
    const p = await newProject('Assignees');
    const task = await makeTask(p, 'Assign me');

    // The member is not on this project's team
    const offTeam = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 1, assigneeId: member.id });
    assert.equal(offTeam.status, 400);
    assert.equal(offTeam.body.error.code, 'INVALID_ASSIGNEE');
    const stranger = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 1, assigneeId: outsider.id });
    assert.equal(stranger.status, 400);
    const createOffTeam = await member.agent.post(p.url).send({ title: 'x', assigneeId: member.id });
    assert.equal(createOffTeam.status, 400);

    // The manager created the project, so they are on the team
    const assigned = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 1, assigneeId: manager.id });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.data.task.assigneeId, manager.id);

    const cleared = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 2, assigneeId: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.task.assigneeId, null);

    const again = await member.agent.patch(`${p.url}/${task.id}`).send({ version: 3, assigneeId: manager.id });
    assert.equal(again.body.data.task.version, 4);

    const remove = await owner.agent.delete(`${p.projectUrl}/members/${manager.id}`);
    assert.equal(remove.status, 200);
    const after = await member.agent.get(`${p.url}/${task.id}`);
    assert.equal(after.body.data.task.assigneeId, null);
    assert.equal(after.body.data.task.version, 5);
  });

  test('moving tasks: between, top, bottom and across columns', async () => {
    const p = await newProject('Moves');
    const a = await makeTask(p, 'A');
    const b = await makeTask(p, 'B');
    const c = await makeTask(p, 'C');
    assert.deepEqual(await column(p, 'todo'), ['A', 'B', 'C']);

    // C between A and B
    let res = await move(p, c, { status: 'todo', prevId: a.id, nextId: b.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.task.version, 2);
    assert.deepEqual(await column(p, 'todo'), ['A', 'C', 'B']);

    // B to the top
    res = await move(p, b, { status: 'todo', nextId: a.id });
    assert.equal(res.status, 200);
    const b2 = res.body.data.task;
    assert.deepEqual(await column(p, 'todo'), ['B', 'A', 'C']);

    // B to the bottom
    res = await move(p, b2, { status: 'todo', prevId: c.id });
    assert.equal(res.status, 200);
    assert.deepEqual(await column(p, 'todo'), ['A', 'C', 'B']);

    // A into an empty column, with no neighbours
    res = await move(p, a, { status: 'in_progress' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.task.status, 'in_progress');
    assert.deepEqual(await column(p, 'todo'), ['C', 'B']);
    assert.deepEqual(await column(p, 'in_progress'), ['A']);
  });

  test('stale or invalid moves are rejected', async () => {
    const p = await newProject('Bad moves');
    const a = await makeTask(p, 'A');
    const b = await makeTask(p, 'B');
    const c = await makeTask(p, 'C');

    const first = await move(p, a, { status: 'done' });
    assert.equal(first.status, 200);

    // a is still passed with version 1, but the server has version 2
    const stale = await move(p, a, { status: 'in_review' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'TASK_VERSION_CONFLICT');
    assert.equal(stale.body.error.details.current.status, 'done');

    // A neighbour that now lives in another column
    const wrongColumn = await move(p, c, { status: 'todo', prevId: a.id, nextId: b.id });
    assert.equal(wrongColumn.status, 409);
    assert.equal(wrongColumn.body.error.code, 'POSITION_CONFLICT');

    // A neighbour that does not exist
    const missing = await move(p, c, { status: 'todo', prevId: '0'.repeat(24), nextId: b.id });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error.code, 'POSITION_CONFLICT');

    // The task itself as a neighbour
    const self = await move(p, c, { status: 'todo', prevId: c.id, nextId: b.id });
    assert.equal(self.status, 409);

    // Neighbours in the wrong order (c is below b)
    const d = await makeTask(p, 'D');
    const reversed = await move(p, d, { status: 'todo', prevId: c.id, nextId: b.id });
    assert.equal(reversed.status, 409);
    assert.equal(reversed.body.error.code, 'POSITION_CONFLICT');

    // Validation
    const same = await move(p, c, { status: 'todo', prevId: b.id, nextId: b.id });
    assert.equal(same.status, 400);
    const bogus = await move(p, c, { status: 'bogus' });
    assert.equal(bogus.status, 400);
  });

  test('a nearly exhausted position gap triggers a rebalance', async () => {
    const p = await newProject('Rebalance');
    const a = await makeTask(p, 'A');
    const b = await makeTask(p, 'B');
    const c = await makeTask(p, 'C');

    // Squeeze A and B so close together that they cannot be split any further
    await Task.updateOne({ _id: a.id }, { position: 1 });
    await Task.updateOne({ _id: b.id }, { position: 1.0000000001 });

    const res = await move(p, c, { status: 'todo', prevId: a.id, nextId: b.id });
    assert.equal(res.status, 200);
    assert.deepEqual(await column(p, 'todo'), ['A', 'C', 'B']);

    const [ta, tc, tb] = await Promise.all([a.id, c.id, b.id].map((id) => Task.findById(id)));
    assert.equal(ta.position, STEP);
    assert.equal(tb.position, 2 * STEP);
    assert.equal(tc.position, 1.5 * STEP);
  });

  test('changing status through PATCH puts the task at the bottom of the new column', async () => {
    const p = await newProject('Status');
    const a = await makeTask(p, 'A');
    const b = await makeTask(p, 'B');

    const resA = await member.agent.patch(`${p.url}/${a.id}`).send({ version: 1, status: 'done' });
    assert.equal(resA.status, 200);
    assert.equal(resA.body.data.task.status, 'done');
    const resB = await member.agent.patch(`${p.url}/${b.id}`).send({ version: 1, status: 'done' });
    assert.equal(resB.status, 200);

    assert.deepEqual(await column(p, 'done'), ['A', 'B']);
    assert.deepEqual(await column(p, 'todo'), []);
  });

  test('an assigned guest can read tasks but not change them', async () => {
    const p = await newProject('Guest');
    const add = await manager.agent.post(`${p.projectUrl}/members`).send({ userId: guest.id });
    assert.equal(add.status, 201);
    const task = await makeTask(p, 'Visible');

    const board = await guest.agent.get(`${p.url}/board`);
    assert.equal(board.status, 200);
    assert.equal(board.body.data.columns.todo.total, 1);
    const one = await guest.agent.get(`${p.url}/${task.id}`);
    assert.equal(one.status, 200);

    assert.equal((await guest.agent.post(p.url).send({ title: 'Nope' })).status, 403);
    assert.equal((await guest.agent.patch(`${p.url}/${task.id}`).send({ version: 1, title: 'Nope' })).status, 403);
    assert.equal((await move(p, task, { status: 'done' }, guest.agent)).status, 403);
    assert.equal((await guest.agent.delete(`${p.url}/${task.id}`)).status, 403);
  });

  test('only managers and above can delete tasks', async () => {
    const p = await newProject('Delete');
    const task = await makeTask(p, 'Doomed');

    const asMember = await member.agent.delete(`${p.url}/${task.id}`);
    assert.equal(asMember.status, 403);

    const asManager = await manager.agent.delete(`${p.url}/${task.id}`);
    assert.equal(asManager.status, 200);

    const gone = await member.agent.get(`${p.url}/${task.id}`);
    assert.equal(gone.status, 404);
    assert.equal(gone.body.error.code, 'TASK_NOT_FOUND');
    assert.deepEqual(await column(p, 'todo'), []);
  });

  test('archived projects are read-only for tasks', async () => {
    const p = await newProject('Archive');
    const task = await makeTask(p, 'Frozen');

    const archive = await manager.agent.patch(p.projectUrl).send({ status: 'archived' });
    assert.equal(archive.status, 200);

    const create = await member.agent.post(p.url).send({ title: 'New' });
    assert.equal(create.status, 409);
    assert.equal(create.body.error.code, 'PROJECT_ARCHIVED');
    assert.equal((await member.agent.patch(`${p.url}/${task.id}`).send({ version: 1, title: 'Edit' })).status, 409);
    assert.equal((await move(p, task, { status: 'done' })).status, 409);
    assert.equal((await manager.agent.delete(`${p.url}/${task.id}`)).status, 409);

    // Reading still works
    assert.equal((await member.agent.get(`${p.url}/board`)).status, 200);
    assert.equal((await member.agent.get(`${p.url}/${task.id}`)).status, 200);

    const restore = await manager.agent.patch(p.projectUrl).send({ status: 'active' });
    assert.equal(restore.status, 200);
    const create2 = await member.agent.post(p.url).send({ title: 'Works again' });
    assert.equal(create2.status, 201);
  });

  test('tasks cannot be reached through another project, another workspace, or with a bad id', async () => {
    const p = await newProject('One');
    const q = await newProject('Two');
    const task = await makeTask(p, 'Only in one');

    const wrongProject = await member.agent.get(`${q.url}/${task.id}`);
    assert.equal(wrongProject.status, 404);
    assert.equal(wrongProject.body.error.code, 'TASK_NOT_FOUND');
    const wrongWrite = await member.agent.patch(`${q.url}/${task.id}`).send({ version: 1, title: 'Hijack' });
    assert.equal(wrongWrite.status, 404);
    const wrongMove = await move(q, task, { status: 'done' });
    assert.equal(wrongMove.status, 404);

    const badId = await member.agent.get(`${p.url}/not-an-id`);
    assert.equal(badId.status, 404);
    assert.equal(badId.body.error.code, 'TASK_NOT_FOUND');

    // A real project id, but through a workspace the caller belongs to
    const viaOther = await outsider.agent.get(`/api/workspaces/${otherWorkspaceId}/projects/${p.id}/tasks/board`);
    assert.equal(viaOther.status, 404);
    assert.equal(viaOther.body.error.code, 'PROJECT_NOT_FOUND');
  });

  test('deleting a project deletes its tasks', async () => {
    const p = await newProject('Doomed project');
    await makeTask(p, 'One');
    await makeTask(p, 'Two');
    assert.equal(await Task.countDocuments({ projectId: p.id }), 2);

    const del = await owner.agent.delete(p.projectUrl);
    assert.equal(del.status, 200);
    assert.equal(await Task.countDocuments({ projectId: p.id }), 0);
  });
});
