import * as service from './message.service.js';
import { messageCreated, messageUpdated, messageDeleted } from '../../sockets/messageevents.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = async (req, res) => ok(res, await service.listMessages(req.project, req.validated.query));

// Every successful write is published to the project room (docs/SOCKET_EVENTS.md).
// Chat is deliberately not recorded in the activity feed: it is high-volume, low-signal.
export const create = async (req, res) => {
  const message = await service.createMessage(req.project, req.user, req.validated.body);
  messageCreated(req.project._id, message, req.user._id);
  return ok(res, { message }, 201);
};

export const update = async (req, res) => {
  const message = await service.updateMessage(req.project, req.message, req.user, req.validated.body);
  messageUpdated(req.project._id, message, req.user._id);
  return ok(res, { message });
};

export const remove = async (req, res) => {
  const { message } = req;
  await service.deleteMessage(req.membership, req.project, message, req.user);
  messageDeleted(req.project._id, message._id, req.user._id);
  return ok(res, null);
};
