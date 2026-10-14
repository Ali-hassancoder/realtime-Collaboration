import { AppError } from '../../utils/AppError.js';
import { Task } from './task.model.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Requires loadProject to have run first (req.project). Matching on projectId means a task
// from another project never resolves. Every failure is a 404.
export async function loadTask(req, _res, next) {
  const { taskId } = req.params;
  const notFound = new AppError(404, 'TASK_NOT_FOUND', 'Task not found.');
  if (!OBJECT_ID.test(taskId)) throw notFound;

  const task = await Task.findOne({ _id: taskId, projectId: req.project._id });
  if (!task) throw notFound;

  req.task = task;
  next();
}