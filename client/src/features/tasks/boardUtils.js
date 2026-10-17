import { STATUS_KEYS } from './constants';

// The server's per-column cap (task.validation.js: default 100, maximum 100). The board never
// shows more, so an event beyond the cap is trimmed exactly like a refetch would trim it.
const COLUMN_LIMIT = 100;

// Returns a new board with the task moved. Pure function; the server stays the authority
// and the board is refetched afterwards.
export function moveInBoard(board, taskId, toStatus, toIndex) {
  let moved = null;
  let fromStatus = null;
  const columns = {};

  for (const key of STATUS_KEYS) {
    const column = board.columns[key];
    const tasks = column.tasks.filter((task) => {
      if (task.id !== taskId) return true;
      moved = task;
      fromStatus = key;
      return false;
    });
    columns[key] = { ...column, tasks };
  }
  if (!moved) return board;

  const target = columns[toStatus].tasks.slice();
  target.splice(toIndex, 0, { ...moved, status: toStatus });
  columns[toStatus] = { ...columns[toStatus], tasks: target };

  if (fromStatus !== toStatus) {
    columns[fromStatus].total -= 1;
    columns[toStatus].total += 1;
  }
  return { ...board, columns };
}

// Drops the task from whichever column holds it; untouched columns keep their identity
function withoutTask(board, taskId) {
  let removed = false;
  const columns = {};
  for (const key of STATUS_KEYS) {
    const column = board.columns[key];
    const tasks = column.tasks.filter((task) => task.id !== taskId);
    if (tasks.length === column.tasks.length) {
      columns[key] = column;
    } else {
      removed = true;
      columns[key] = { ...column, tasks, total: column.total - 1 };
    }
  }
  return { removed, columns };
}

// Applies a task received from a server event (task.created / task.updated): any older copy is
// removed and the new one is inserted where its position orders it.
export function upsertInBoard(board, task) {
  const { columns } = withoutTask(board, task.id);
  const column = columns[task.status];
  const tasks = column.tasks.slice();
  const at = tasks.findIndex((t) => t.position > task.position);
  tasks.splice(at === -1 ? tasks.length : at, 0, task);
  if (tasks.length > COLUMN_LIMIT) tasks.length = COLUMN_LIMIT;
  return { ...board, columns: { ...columns, [task.status]: { ...column, tasks, total: column.total + 1 } } };
}

// Applies task.deleted from a server event
export function removeFromBoard(board, taskId) {
  const { removed, columns } = withoutTask(board, taskId);
  return removed ? { ...board, columns } : board;
}