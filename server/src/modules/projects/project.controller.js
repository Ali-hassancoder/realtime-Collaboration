import * as service from './project.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = async (req, res) =>
  ok(res, await service.listProjects(req.membership, req.validated.query));

export const create = async (req, res) =>
  ok(res, { project: await service.createProject(req.membership, req.user, req.validated.body) }, 201);

export const get = (req, res) => ok(res, { project: req.project });

export const update = async (req, res) =>
  ok(res, { project: await service.updateProject(req.project, req.validated.body) });

export const remove = async (req, res) => {
  await service.deleteProject(req.project);
  ok(res, null);
};

export const listMembers = async (req, res) =>
  ok(res, { members: await service.listProjectMembers(req.project) });

export const addMember = async (req, res) =>
  ok(res, { member: await service.addProjectMember(req.membership, req.project, req.validated.body.userId) }, 201);

export const removeMember = async (req, res) => {
  await service.removeProjectMember(req.project, req.validated.params.userId);
  ok(res, null);
};