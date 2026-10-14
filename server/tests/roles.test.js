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
import { permissionsFor } from '../src/modules/workspaces/workspace.permissions.js';

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('roles and permissions (API)', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  let owner, admin, manager, member, guest, workspaceId;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@roles-test.example`;
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
    assert.equal(acc.body.data.workspace.role, role);
  }

  before(async () => {
    await mongoose.connect(testUri);
    owner = await registerAgent('owner');
    admin = await registerAgent('admin');
    manager = await registerAgent('manager');
    member = await registerAgent('member');
    guest = await registerAgent('guest');

    const ws = await owner.agent.post('/api/workspaces').send({ name: 'Roles Team' });
    assert.equal(ws.status, 201);
    workspaceId = ws.body.data.workspace.id;

    await join(admin, 'admin');
    await join(manager, 'manager');
    await join(member, 'member');
    await join(guest, 'guest');
  });

  after(async () => {
    const users = await User.find({ email: /@roles-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  test('workspace response includes the permissions of the caller\'s role', async () => {
    const cases = [
      [owner, 'owner'],
      [admin, 'admin'],
      [manager, 'manager'],
      [member, 'member'],
      [guest, 'guest'],
    ];
    for (const [user, role] of cases) {
      const res = await user.agent.get(`/api/workspaces/${workspaceId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.workspace.role, role);
      assert.deepEqual(res.body.data.workspace.permissions, permissionsFor(role));
    }
    const mgr = (await manager.agent.get(`/api/workspaces/${workspaceId}`)).body.data.workspace.permissions;
    assert.ok(mgr.includes('project:create'));
    assert.equal(mgr.includes('member:invite'), false);
    const gst = (await guest.agent.get(`/api/workspaces/${workspaceId}`)).body.data.workspace.permissions;
    assert.ok(gst.includes('task:read'));
    assert.equal(gst.includes('task:create'), false);
  });

  test('unknown roles and "owner" are rejected as invite roles', async () => {
    const email = `nobody-${stamp}@roles-test.example`;
    const bad = await owner.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email, role: 'superuser' });
    assert.equal(bad.status, 400);
    const own = await owner.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email, role: 'owner' });
    assert.equal(own.status, 400);
  });

  test('manager, member and guest cannot invite or list invites', async () => {
    for (const user of [manager, member, guest]) {
      const post = await user.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: `x-${stamp}@roles-test.example` });
      assert.equal(post.status, 403);
      const list = await user.agent.get(`/api/workspaces/${workspaceId}/invites`);
      assert.equal(list.status, 403);
    }
  });

  test('manager, member and guest cannot update or delete the workspace', async () => {
    for (const user of [manager, member, guest]) {
      const upd = await user.agent.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Hacked' });
      assert.equal(upd.status, 403);
      const del = await user.agent.delete(`/api/workspaces/${workspaceId}`);
      assert.equal(del.status, 403);
    }
  });

  test('everyone in the workspace can read the member list, including guests', async () => {
    const res = await guest.agent.get(`/api/workspaces/${workspaceId}/members`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.members.length, 5);
  });

  test('manager cannot change roles or remove members', async () => {
    const role = await manager.agent.patch(`/api/workspaces/${workspaceId}/members/${member.id}`).send({ role: 'guest' });
    assert.equal(role.status, 403);
    const remove = await manager.agent.delete(`/api/workspaces/${workspaceId}/members/${member.id}`);
    assert.equal(remove.status, 403);
    // Still a member afterwards
    const still = await member.agent.get(`/api/workspaces/${workspaceId}`);
    assert.equal(still.status, 200);
  });

  test('admin can invite a manager but not another admin', async () => {
    const email = `extra-${stamp}@roles-test.example`;
    const asAdmin = await admin.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email, role: 'admin' });
    assert.equal(asAdmin.status, 403);
    const asManager = await admin.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email, role: 'manager' });
    assert.equal(asManager.status, 201);
  });

  test('admin can promote a member to manager, but not to admin, and cannot touch the owner', async () => {
    const toAdmin = await admin.agent.patch(`/api/workspaces/${workspaceId}/members/${member.id}`).send({ role: 'admin' });
    assert.equal(toAdmin.status, 403);

    const touchOwner = await admin.agent.patch(`/api/workspaces/${workspaceId}/members/${owner.id}`).send({ role: 'guest' });
    assert.equal(touchOwner.status, 403);

    const toManager = await admin.agent.patch(`/api/workspaces/${workspaceId}/members/${member.id}`).send({ role: 'manager' });
    assert.equal(toManager.status, 200);
    const check = await member.agent.get(`/api/workspaces/${workspaceId}`);
    assert.equal(check.body.data.workspace.role, 'manager');
    assert.ok(check.body.data.workspace.permissions.includes('project:create'));
  });
});