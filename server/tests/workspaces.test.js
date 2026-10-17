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

const testUri = process.env.MONGO_URI_TEST;
const skipReason =
  !testUri || testUri === process.env.MONGO_URI ? 'Set MONGO_URI_TEST to a separate test database' : false;

describe('workspaces', { skip: skipReason }, () => {
  const app = createApp();
  const stamp = Date.now();
  const password = 'correct-horse-9';
  let owner, bob, carol, workspaceId, inviteToken;

  async function registerAgent(name) {
    const agent = request.agent(app);
    const email = `${name}-${stamp}@ws-test.example`;
    const res = await agent.post('/api/auth/register').send({ name: `${name} User`, email, password });
    assert.equal(res.status, 201);
    return { agent, email, id: res.body.data.user.id };
  }

  before(async () => {
    await mongoose.connect(testUri);
    owner = await registerAgent('owner');
    bob = await registerAgent('bob');
    carol = await registerAgent('carol');
  });

  after(async () => {
    const users = await User.find({ email: /@ws-test\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    await WorkspaceMember.deleteMany({ userId: { $in: ids } });
    await Workspace.deleteMany({ ownerId: { $in: ids } });
    await WorkspaceInvite.deleteMany({ invitedBy: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/workspaces');
    assert.equal(res.status, 401);
  });

  test('creates a workspace; creator becomes owner', async () => {
    const res = await owner.agent.post('/api/workspaces').send({ name: 'Acme Team' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.workspace.role, 'owner');
    workspaceId = res.body.data.workspace.id;
  });

  test('rejects invalid workspace data', async () => {
    const res = await owner.agent.post('/api/workspaces').send({ name: 'x' });
    assert.equal(res.status, 400);
  });

  test('non-member gets 404 (cannot probe IDs)', async () => {
    const res = await bob.agent.get(`/api/workspaces/${workspaceId}`);
    assert.equal(res.status, 404);
    const members = await bob.agent.get(`/api/workspaces/${workspaceId}/members`);
    assert.equal(members.status, 404);
  });

  test('owner creates an invite; list never exposes tokens', async () => {
    const res = await owner.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: bob.email, role: 'member' });
    assert.equal(res.status, 201);
    inviteToken = res.body.data.inviteUrl.split('/').pop();
    assert.ok(inviteToken.length > 20);

    const list = await owner.agent.get(`/api/workspaces/${workspaceId}/invites`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.invites.length, 1);
    assert.equal(list.body.data.invites[0].tokenHash, undefined);
    assert.equal(JSON.stringify(list.body).includes(inviteToken), false);
  });

  test('a different email cannot accept the invite', async () => {
    const res = await carol.agent.post('/api/invites/accept').send({ token: inviteToken });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'INVITE_EMAIL_MISMATCH');
  });

  test('invited user accepts and becomes a member', async () => {
    const res = await bob.agent.post('/api/invites/accept').send({ token: inviteToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.workspace.role, 'member');

    const again = await bob.agent.post('/api/invites/accept').send({ token: inviteToken });
    assert.equal(again.status, 404); // single use

    const list = await bob.agent.get('/api/workspaces');
    assert.equal(list.body.data.workspaces.length, 1);
  });

  test('a plain member cannot update, invite or manage', async () => {
    const upd = await bob.agent.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Hacked' });
    assert.equal(upd.status, 403);
    const inv = await bob.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: carol.email });
    assert.equal(inv.status, 403);
    const role = await bob.agent.patch(`/api/workspaces/${workspaceId}/members/${owner.id}`).send({ role: 'guest' });
    assert.equal(role.status, 403);
  });

  test('owner promotes bob to admin; admin limits are enforced', async () => {
    const promote = await owner.agent.patch(`/api/workspaces/${workspaceId}/members/${bob.id}`).send({ role: 'admin' });
    assert.equal(promote.status, 200);

    const upd = await bob.agent.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Acme Renamed' });
    assert.equal(upd.status, 200);

    // Admin cannot touch the owner, cannot invite another admin, cannot delete the workspace
    const demoteOwner = await bob.agent.patch(`/api/workspaces/${workspaceId}/members/${owner.id}`).send({ role: 'guest' });
    assert.equal(demoteOwner.status, 403);
    const removeOwner = await bob.agent.delete(`/api/workspaces/${workspaceId}/members/${owner.id}`);
    assert.equal(removeOwner.status, 403);
    const inviteAdmin = await bob.agent.post(`/api/workspaces/${workspaceId}/invites`).send({ email: carol.email, role: 'admin' });
    assert.equal(inviteAdmin.status, 403);
    const del = await bob.agent.delete(`/api/workspaces/${workspaceId}`);
    assert.equal(del.status, 403);
  });

  test('role cannot be set to owner through the API', async () => {
    const res = await owner.agent.patch(`/api/workspaces/${workspaceId}/members/${bob.id}`).send({ role: 'owner' });
    assert.equal(res.status, 400);
  });

  test('members list shows both members', async () => {
    const res = await bob.agent.get(`/api/workspaces/${workspaceId}/members`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.members.length, 2);
  });

  test('owner cannot leave; a member can', async () => {
    const ownerLeave = await owner.agent.delete(`/api/workspaces/${workspaceId}/members/${owner.id}`);
    assert.equal(ownerLeave.status, 403);
    assert.equal(ownerLeave.body.error.code, 'OWNER_CANNOT_LEAVE');

    const bobLeave = await bob.agent.delete(`/api/workspaces/${workspaceId}/members/${bob.id}`);
    assert.equal(bobLeave.status, 200);
    const after = await bob.agent.get(`/api/workspaces/${workspaceId}`);
    assert.equal(after.status, 404);
  });

  test('only the owner can delete the workspace', async () => {
    const res = await owner.agent.delete(`/api/workspaces/${workspaceId}`);
    assert.equal(res.status, 200);
    const gone = await owner.agent.get(`/api/workspaces/${workspaceId}`);
    assert.equal(gone.status, 404);
  });

  test('profile update and password change revoke sessions', async () => {
    const upd = await carol.agent.patch('/api/users/me').send({ name: 'Carol Renamed' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.user.name, 'Carol Renamed');

    const wrong = await carol.agent.post('/api/users/me/password').send({ currentPassword: 'nope-nope-1', newPassword: 'new-password-9' });
    assert.equal(wrong.status, 400);

    const ok = await carol.agent.post('/api/users/me/password').send({ currentPassword: password, newPassword: 'new-password-9' });
    assert.equal(ok.status, 200);

    const me = await carol.agent.get('/api/auth/me');
    assert.equal(me.status, 401);
    const login = await request(app).post('/api/auth/login').send({ email: carol.email, password: 'new-password-9' });
    assert.equal(login.status, 200);
  });
});
