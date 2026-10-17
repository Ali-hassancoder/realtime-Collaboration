import * as service from './comment.service.js';
import { recordActivity } from '../activity/activity.service.js';
import { notify } from '../notification/notification.service.js';
import { commentCreated, commentUpdated, commentDeleted } from '../../sockets/commentevents.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const excerpt = (text) => (text.length > 140 ? `${text.slice(0, 140)}...` : text);

export const list = async (req, res) => ok(res, await service.listComments(req.task, req.validated.query));

// Every successful write is published to the project room (docs/SOCKET_EVENTS.md) and
// recorded in the activity feed
export const create = async (req, res) => {
  const comment = await service.createComment(req.project, req.task, req.user, req.validated.body);
  commentCreated(req.project._id, comment, req.user._id);
  await recordActivity({
    project: req.project,
    actor: req.user,
    type: 'comment.created',
    taskId: req.task._id,
    meta: { taskTitle: req.task.title, excerpt: excerpt(comment.body) },
  });
  // The assignee hears about comments on their task; notify() drops self-notifications
  if (req.task.assigneeId) {
    await notify({
      recipientId: req.task.assigneeId,
      actor: req.user,
      type: 'comment.created',
      workspaceId: req.project.workspaceId,
      projectId: req.project._id,
      taskId: req.task._id,
      meta: { taskTitle: req.task.title, excerpt: excerpt(comment.body) },
    });
  }
  return ok(res, { comment }, 201);
};

export const update = async (req, res) => {
  const comment = await service.updateComment(req.project, req.comment, req.user, req.validated.body);
  commentUpdated(req.project._id, comment, req.user._id);
  return ok(res, { comment });
};

export const remove = async (req, res) => {
  const { comment } = req;
  await service.deleteComment(req.membership, req.project, comment, req.user);
  commentDeleted(req.project._id, comment._id, comment.taskId, req.user._id);
  return ok(res, null);
};
