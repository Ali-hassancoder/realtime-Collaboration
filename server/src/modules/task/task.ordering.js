import { Task, MAX_TASKS_PER_PROJECT } from './task.model.js';

// Positions are floats so a task can be dropped between two others without renumbering the column.
export const STEP = 1024;
export const MIN_GAP = 1e-6;

// Midpoint of two positions, or null when the gap is too small to split safely
export function betweenPosition(prev, next) {
  if (next - prev <= MIN_GAP) return null;
  return (prev + next) / 2;
}

async function edgePosition(projectId, status, excludeId, direction) {
  const filter = { projectId, status };
  if (excludeId) filter._id = { $ne: excludeId };
  const edge = await Task.findOne(filter).sort({ position: direction }).select('position');
  if (!edge) return STEP;
  return direction === 1 ? edge.position - STEP : edge.position + STEP;
}

// Below the last task of the column (or STEP for an empty column)
export const endPosition = (projectId, status, excludeId) => edgePosition(projectId, status, excludeId, -1);
// Above the first task of the column
export const startPosition = (projectId, status, excludeId) => edgePosition(projectId, status, excludeId, 1);

// Renumbers a column to 1024, 2048, ... keeping the current order. Does not bump versions:
// clients only care about relative order, so their cached tasks stay valid.
export async function rebalanceColumn(projectId, status) {
  const tasks = await Task.find({ projectId, status })
    .sort({ position: 1, _id: 1 })
    .select('_id')
    .limit(MAX_TASKS_PER_PROJECT)
    .lean();
  if (tasks.length === 0) return;
  await Task.bulkWrite(
    tasks.map((t, i) => ({
      updateOne: { filter: { _id: t._id }, update: { $set: { position: (i + 1) * STEP } } },
    })),
    { ordered: false }
  );
}