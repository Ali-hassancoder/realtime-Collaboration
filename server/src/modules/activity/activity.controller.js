import * as service from './activity.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// The feed is written by recordActivity in the task and comment flows; it has no write endpoint
export const list = async (req, res) => ok(res, await service.listActivity(req.project, req.validated.query));
