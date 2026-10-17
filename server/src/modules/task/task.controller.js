import * as service from './task.service.js';
import { taskCreated, taskUpdated, taskDeleted } from '../../sockets/taskevents.js';
import { recordActivity } from '../activity/activity.service.js';
import { notify } from '../notification/notification.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const board = async (req, res) => ok(res, await service.getBoard(req.project, req.validated.query));

// Every successful write is published to the project room (docs/SOCKET_EVENTS.md) and
// recorded in the activity feed (docs/ARCHITECTURE.md)
export const create = async (req, res) => {
  const task = await service.createTask(req.membership, req.project, req.user, req.validated.body);
  taskCreated(req.project._id, task, req.user._id);
  await recordActivity({
    project: req.project,
    actor: req.user,
    type: 'task.created',
    taskId: task._id,
    meta: { title: task.title },
  });
  if (task.assigneeId) {
    await notify({
      recipientId: task.assigneeId,
      actor: req.user,
      type: 'task.assigned',
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      taskId: task._id,
      meta: { taskTitle: task.title },
    });
  }
  return ok(res, { task }, 201);
};

export const get = (req, res) => ok(res, { task: req.task });

export const update = async (req, res) => {
  const task = await service.updateTask(req.membership, req.project, req.task, req.validated.body);
  taskUpdated(req.project._id, task, req.user._id);
  // Version is concurrency control, not an edit worth showing in the feed
  const fields = Object.keys(req.validated.body).filter((key) => key !== 'version');
  await recordActivity({
    project: req.project,
    actor: req.user,
    type: 'task.updated',
    taskId: task._id,
    meta: { title: task.title, fields },
  });
  // Only an assignee change that lands on someone else is worth a notification
  const assignmentChanged =
    'assigneeId' in req.validated.body && String(task.assigneeId ?? '') !== String(req.task.assigneeId ?? '');
  if (assignmentChanged && task.assigneeId) {
    await notify({
      recipientId: task.assigneeId,
      actor: req.user,
      type: 'task.assigned',
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      taskId: task._id,
      meta: { taskTitle: task.title },
    });
  }
  return ok(res, { task });
};

export const move = async (req, res) => {
  const from = req.task.status;
  const task = await service.moveTask(req.project, req.task, req.validated.body);
  taskUpdated(req.project._id, task, req.user._id);
  await recordActivity({
    project: req.project,
    actor: req.user,
    type: 'task.moved',
    taskId: task._id,
    meta: { title: task.title, from, to: task.status },
  });
  return ok(res, { task });
};

export const remove = async (req, res) => {
  const { task } = req;
  await service.deleteTask(req.project, task);
  taskDeleted(req.project._id, task._id, req.user._id);
  // Recorded after the delete cascade: the task's earlier history is gone, this entry stands alone
  await recordActivity({ project: req.project, actor: req.user, type: 'task.deleted', meta: { title: task.title } });
  return ok(res, null);
};