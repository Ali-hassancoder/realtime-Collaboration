import * as service from './task.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const board = async (req, res) => ok(res, await service.getBoard(req.project, req.validated.query));

export const create = async (req, res) =>
  ok(res, { task: await service.createTask(req.membership, req.project, req.user, req.validated.body) }, 201);

export const get = (req, res) => ok(res, { task: req.task });

export const update = async (req, res) =>
  ok(res, { task: await service.updateTask(req.membership, req.project, req.task, req.validated.body) });

export const move = async (req, res) =>
  ok(res, { task: await service.moveTask(req.project, req.task, req.validated.body) });

export const remove = async (req, res) => {
  await service.deleteTask(req.project, req.task);
  ok(res, null);
};