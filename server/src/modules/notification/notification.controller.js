import * as service from './notification.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = async (req, res) => ok(res, await service.listNotifications(req.user._id, req.validated.query));

export const read = async (req, res) =>
  ok(res, { notification: await service.markRead(req.user._id, req.validated.params.notificationId) });

export const readAll = async (req, res) => ok(res, await service.markAllRead(req.user._id));
