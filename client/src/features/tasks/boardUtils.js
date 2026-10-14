import { STATUS_KEYS } from './constants';

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