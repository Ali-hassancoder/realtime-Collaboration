import * as service from './workspace.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = async (req, res) => ok(res, { workspaces: await service.listWorkspaces(req.user._id) });
export const create = async (req, res) => ok(res, { workspace: await service.createWorkspace(req.user, req.validated.body) }, 201);
export const get = async (req, res) => ok(res, { workspace: await service.getWorkspace(req.membership) });
export const update = async (req, res) =>
  ok(res, { workspace: await service.updateWorkspace(req.membership, req.validated.body) });
export const remove = async (req, res) => {
  await service.deleteWorkspace(req.membership);
  ok(res, null);
};

export const listMembers = async (req, res) =>
  ok(res, { members: await service.listMembers(req.membership.workspaceId) });
export const updateMemberRole = async (req, res) =>
  ok(res, { member: await service.updateMemberRole(req.membership, req.validated.params.userId, req.validated.body.role) });
export const removeMember = async (req, res) => {
  await service.removeMember(req.membership, req.validated.params.userId);
  ok(res, null);
};

export const listInvites = async (req, res) =>
  ok(res, { invites: await service.listInvites(req.membership.workspaceId) });
export const createInvite = async (req, res) => ok(res, await service.createInvite(req.membership, req.validated.body), 201);
export const deleteInvite = async (req, res) => {
  await service.deleteInvite(req.membership.workspaceId, req.validated.params.inviteId);
  ok(res, null);
};

export const acceptInvite = async (req, res) =>
  ok(res, { workspace: await service.acceptInvite(req.user, req.validated.body.token) });