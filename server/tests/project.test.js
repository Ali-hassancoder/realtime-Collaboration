import './setup.js';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { WorkspaceMember } from '../src/modules/workspaces/workspaceMember.model.js';
import { WorkspaceInvite } from '../src/modules/workspaces/workspaceInvite.model.js';
import { Project } from '../src/modules/projects/project.model.js';
import { ProjectMember } from '../src/modules/projects/projectMember.model.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('projects (API)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  let owner, admin, manager, member, guest, outsider;
  let workspaceId, otherWorkspaceId, projectId, secondProjectId;
  const url = (path = '') => `/api/workspaces/${workspaceId}/projects${path}`;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@projects-test.example`;
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

  before(async () => {
    await mongoose.connect(testUri);
    owner = await registerAgent('owner');
    admin = await registerAgent('admin');
    manager = await registerAgent('manager');
    member = await registerAgent('member');
    guest = await registerAgent('guest');
    outsider = await registerAgent('outsider');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Projects Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    const other = await outsider.agent.post('/api/workspaces').send({ name: 'Other Team' });
    assert.equal(other.status, 201);
    otherWorkspaceId = other.body.data.workspace.id;

    await join(admin, 'admin');
    await join(manager, 'manager');
    await join(member, 'member');
    await join(guest, 'guest');
  });

  after(async () => {
    const users = await User.find({ email: /@projects-test\.example$/ }).select('_id');
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

  test('members and guests cannot create projects', async () => {
    for (const user of [member, guest]) {
      const res = await user.agent.post(url()).send({ name: 'Nope Project' });
      assert.equal(res.status, 403);
    }
  });

  test('rejects invalid project data', async () => {
    const res = await manager.agent.post(url()).send({ name: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('a manager creates a project', async () => {
    const res = await manager.agent.post(url()).send({ name: 'Website Redesign', description: 'Q4 work' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.project.name, 'Website Redesign');
    assert.equal(res.body.data.project.status, 'active');
    projectId = res.body.data.project.id;
  });

  test('the creator is on the project team', async () => {
    const res = await manager.agent.get(url(`/${projectId}/members`));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.members.length, 1);
    assert.equal(res.body.data.members[0].userId, manager.id);
    assert.equal(res.body.data.members[0].workspaceRole, 'manager');
  });

  test('members see all projects; an unassigned guest sees none and gets 404 on direct access', async () => {
    const memberList = await member.agent.get(url());
    assert.equal(memberList.status, 200);
    assert.equal(memberList.body.data.total, 1);

    const guestList = await guest.agent.get(url());
    assert.equal(guestList.status, 200);
    assert.equal(guestList.body.data.total, 0);
    assert.deepEqual(guestList.body.data.projects, []);

    const direct = await guest.agent.get(url(`/${projectId}`));
    assert.equal(direct.status, 404);
    assert.equal(direct.body.error.code, 'PROJECT_NOT_FOUND');
    const team = await guest.agent.get(url(`/${projectId}/members`));
    assert.equal(team.status, 404);
  });

  test('a malformed project id is a 404, not a server error', async () => {
    const res = await owner.agent.get(url('/not-an-id'));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'PROJECT_NOT_FOUND');
  });

  test('projects are not reachable through another workspace or by outsiders', async () => {
    // Real project id, but the caller owns a different workspace
    const viaOther = await outsider.agent.get(`/api/workspaces/${otherWorkspaceId}/projects/${projectId}`);
    assert.equal(viaOther.status, 404);
    assert.equal(viaOther.body.error.code, 'PROJECT_NOT_FOUND');

    // Not a member of this workspace at all
    const direct = await outsider.agent.get(url());
    assert.equal(direct.status, 404);
    assert.equal(direct.body.error.code, 'WORKSPACE_NOT_FOUND');
  });

  test('manager adds a guest to the project; non-workspace members and duplicates are rejected', async () => {
    const add = await manager.agent.post(url(`/${projectId}/members`)).send({ userId: guest.id });
    assert.equal(add.status, 201);

    const stranger = await manager.agent.post(url(`/${projectId}/members`)).send({ userId: outsider.id });
    assert.equal(stranger.status, 404);
    assert.equal(stranger.body.error.code, 'MEMBER_NOT_FOUND');

    const dup = await manager.agent.post(url(`/${projectId}/members`)).send({ userId: guest.id });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_PROJECT_MEMBER');
  });

  test('an assigned guest can read the project but cannot change anything', async () => {
    const list = await guest.agent.get(url());
    assert.equal(list.body.data.total, 1);
    const get = await guest.agent.get(url(`/${projectId}`));
    assert.equal(get.status, 200);

    const patch = await guest.agent.patch(url(`/${projectId}`)).send({ name: 'Hacked' });
    assert.equal(patch.status, 403);
    const add = await guest.agent.post(url(`/${projectId}/members`)).send({ userId: member.id });
    assert.equal(add.status, 403);
    const del = await guest.agent.delete(url(`/${projectId}`));
    assert.equal(del.status, 403);
  });

  test('a plain member cannot update the project or manage its team', async () => {
    const patch = await member.agent.patch(url(`/${projectId}`)).send({ name: 'Hacked' });
    assert.equal(patch.status, 403);
    const add = await member.agent.post(url(`/${projectId}/members`)).send({ userId: member.id });
    assert.equal(add.status, 403);
  });

  test('archiving hides a project from the default list and can be undone', async () => {
    const bad = await manager.agent.patch(url(`/${projectId}`)).send({ status: 'bogus' });
    assert.equal(bad.status, 400);

    const archive = await manager.agent.patch(url(`/${projectId}`)).send({ status: 'archived' });
    assert.equal(archive.status, 200);
    assert.equal(archive.body.data.project.status, 'archived');

    const active = await manager.agent.get(url());
    assert.equal(active.body.data.total, 0);
    const archived = await manager.agent.get(url('?status=archived'));
    assert.equal(archived.body.data.total, 1);

    const restore = await manager.agent.patch(url(`/${projectId}`)).send({ status: 'active' });
    assert.equal(restore.status, 200);
  });

  test('lists are paginated', async () => {
    const second = await manager.agent.post(url()).send({ name: 'Second Project' });
    assert.equal(second.status, 201);
    secondProjectId = second.body.data.project.id;

    const page1 = await manager.agent.get(url('?limit=1&page=1'));
    assert.equal(page1.body.data.projects.length, 1);
    assert.equal(page1.body.data.total, 2);
    const page2 = await manager.agent.get(url('?limit=1&page=2'));
    assert.equal(page2.body.data.projects.length, 1);
    assert.notEqual(page1.body.data.projects[0].id, page2.body.data.projects[0].id);

    const tooBig = await manager.agent.get(url('?limit=100000'));
    assert.equal(tooBig.status, 400);
  });

  test('removing a guest from a project revokes their access', async () => {
    const remove = await manager.agent.delete(url(`/${projectId}/members/${guest.id}`));
    assert.equal(remove.status, 200);
    const get = await guest.agent.get(url(`/${projectId}`));
    assert.equal(get.status, 404);
    const again = await manager.agent.delete(url(`/${projectId}/members/${guest.id}`));
    assert.equal(again.status, 404);
  });

  test('leaving the workspace removes project memberships', async () => {
    const add = await manager.agent.post(url(`/${projectId}/members`)).send({ userId: guest.id });
    assert.equal(add.status, 201);
    assert.equal(await ProjectMember.countDocuments({ userId: guest.id }), 1);

    const leave = await guest.agent.delete(`/api/workspaces/${workspaceId}/members/${guest.id}`);
    assert.equal(leave.status, 200);
    assert.equal(await ProjectMember.countDocuments({ userId: guest.id }), 0);
  });

  test('a manager cannot delete a project; an admin can, and the team entries go with it', async () => {
    const asManager = await manager.agent.delete(url(`/${projectId}`));
    assert.equal(asManager.status, 403);

    const asAdmin = await admin.agent.delete(url(`/${projectId}`));
    assert.equal(asAdmin.status, 200);

    const gone = await owner.agent.get(url(`/${projectId}`));
    assert.equal(gone.status, 404);
    assert.equal(await ProjectMember.countDocuments({ projectId }), 0);
    // The other project is untouched
    const other = await owner.agent.get(url(`/${secondProjectId}`));
    assert.equal(other.status, 200);
  });
});