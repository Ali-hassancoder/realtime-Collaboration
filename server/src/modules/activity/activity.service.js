import { logger } from '../../utils/logger.js';
import { Activity } from './activity.model.js';
import { activityCreated } from '../../sockets/activityevents.js';

// The REST and event shape: the actor name is embedded so clients need no extra lookup
const serialize = (activity) => {
  const { actorId, ...rest } = activity.toJSON();
  return {
    ...rest,
    actorId: String(actorId?.id ?? actorId),
    actor: actorId?.id ? { id: actorId.id, name: actorId.name } : null,
  };
};

// Fire-and-forget: a failure here must never fail the write it describes. Unlike task and
// comment events this one is delivered to the actor too (append-only shared feed), so the
// acting client dedupes by id instead of ignoring its own echo.
export async function recordActivity({ project, actor, type, taskId = null, meta = {} }) {
  try {
    const activity = await Activity.create({
      workspaceId: project.workspaceId,
      projectId: project._id,
      actorId: actor._id,
      type,
      taskId,
      meta,
    });
    activityCreated(project._id, serialize(await activity.populate('actorId', 'name')));
  } catch (err) {
    logger.error({ err }, 'Failed to record activity');
  }
}

export async function listActivity(project, { before, limit }) {
  // Newest-first query with a limit+1 probe; the feed is served newest first
  const query = { projectId: project._id, ...(before ? { _id: { $lt: before } } : {}) };
  const found = await Activity.find(query).sort({ _id: -1 }).limit(limit + 1).populate('actorId', 'name');
  const hasMore = found.length > limit;
  const page = hasMore ? found.slice(0, limit) : found;
  return { activities: page.map(serialize), hasMore };
}
