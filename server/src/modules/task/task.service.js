import { AppError } from '../../utils/AppError.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { can } from '../workspaces/workspace.permissions.js';
import { Task, TASK_STATUSES, MAX_TASKS_PER_PROJECT } from './task.model.js';
import { betweenPosition, endPosition, startPosition, rebalanceColumn } from './task.ordering.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
const positionConflict = () =>
  new AppError(409, 'POSITION_CONFLICT', 'The board changed while you were moving this task.');
const versionConflict = (current) =>
  new AppError(409, 'TASK_VERSION_CONFLICT', 'This task was changed by someone else.', { current });

function assertProjectActive(project) {
  if (project.status === 'archived') {
    throw new AppError(409, 'PROJECT_ARCHIVED', 'This project is archived. Restore it to change its tasks.');
  }
}

async function assertAssignable(project, assigneeId) {
  const onTeam = await ProjectMember.exists({ projectId: project._id, userId: assigneeId });
  if (!onTeam) {
    throw new AppError(400, 'INVALID_ASSIGNEE', 'The assignee must be a member of the project team.');
  }
}

// Called when an atomic update matched nothing: either the task is gone or its version moved on
async function conflictOrMissing(taskId, projectId) {
  const current = await Task.findOne({ _id: taskId, projectId });
  return current ? versionConflict(current) : new AppError(404, 'TASK_NOT_FOUND', 'Task not found.');
}

export async function getBoard(project, { limit }) {
  const entries = await Promise.all(
    TASK_STATUSES.map(async (status) => {
      const filter = { projectId: project._id, status };
      const [tasks, total] = await Promise.all([
        // Descriptions are only loaded when a task is opened
        Task.find(filter).select('-description').sort({ position: 1, _id: 1 }).limit(limit),
        Task.countDocuments(filter),
      ]);
      return [status, { tasks, total }];
    })
  );
  return { columns: Object.fromEntries(entries) };
}

export async function createTask(membership, project, user, input) {
  assertProjectActive(project);

  if (input.assigneeId) {
    if (!can(membership.role, 'task:assign')) throw forbidden();
    await assertAssignable(project, input.assigneeId);
  }

  const count = await Task.countDocuments({ projectId: project._id });
  if (count >= MAX_TASKS_PER_PROJECT) {
    throw new AppError(409, 'TASK_LIMIT_REACHED', `A project can hold at most ${MAX_TASKS_PER_PROJECT} tasks.`);
  }

  const position = await endPosition(project._id, input.status);
  return Task.create({
    ...input,
    workspaceId: project.workspaceId,
    projectId: project._id,
    position,
    createdBy: user._id,
  });
}

export async function updateTask(membership, project, task, { version, ...changes }) {
  assertProjectActive(project);
  // Fast path; the atomic update below is what actually guarantees correctness
  if (task.version !== version) throw versionConflict(task);

  const $set = { ...changes };

  const assigneeChanged =
    'assigneeId' in changes && String(changes.assigneeId ?? '') !== String(task.assigneeId ?? '');
  if (assigneeChanged) {
    if (!can(membership.role, 'task:assign')) throw forbidden();
    if (changes.assigneeId) await assertAssignable(project, changes.assigneeId);
  }

  // A status change through PATCH puts the task at the bottom of its new column
  if (changes.status && changes.status !== task.status) {
    $set.position = await endPosition(project._id, changes.status);
  }

  const updated = await Task.findOneAndUpdate(
    { _id: task._id, projectId: project._id, version },
    { $set, $inc: { version: 1 } },
    { new: true, runValidators: true }
  );
  if (!updated) throw await conflictOrMissing(task._id, project._id);
  return updated;
}

async function positionBetween(projectId, status, taskId, prevId, nextId) {
  if (String(prevId) === String(taskId) || String(nextId) === String(taskId)) throw positionConflict();

  // Both neighbours must still exist, be in the target column, and be in order
  const load = () =>
    Promise.all([prevId, nextId].map((id) => Task.findOne({ _id: id, projectId, status }).select('position')));

  let [prev, next] = await load();
  if (!prev || !next || prev.position > next.position) throw positionConflict();

  let position = betweenPosition(prev.position, next.position);
  if (position === null) {
    // Gap exhausted: renumber the column, then try again
    await rebalanceColumn(projectId, status);
    [prev, next] = await load();
    if (!prev || !next || prev.position >= next.position) throw positionConflict();
    position = betweenPosition(prev.position, next.position);
    if (position === null) throw positionConflict();
  }
  return position;
}

export async function moveTask(project, task, { version, status, prevId, nextId }) {
  assertProjectActive(project);
  if (task.version !== version) throw versionConflict(task);

  let position;
  if (prevId && nextId) {
    position = await positionBetween(project._id, status, task._id, prevId, nextId);
  } else if (nextId) {
    position = await startPosition(project._id, status, task._id);
  } else {
    position = await endPosition(project._id, status, task._id);
  }

  const moved = await Task.findOneAndUpdate(
    { _id: task._id, projectId: project._id, version },
    { $set: { status, position }, $inc: { version: 1 } },
    { new: true, runValidators: true }
  );
  if (!moved) throw await conflictOrMissing(task._id, project._id);
  return moved;
}

export async function deleteTask(project, task) {
  assertProjectActive(project);
  await Task.deleteOne({ _id: task._id });
  // Phase 9: also delete the task's comments and activity here
}