import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DragDropContext } from '@hello-pangea/dnd';
import FullPageSpinner from '../../components/FullPageSpinner';
import { hasPermission } from '../../lib/permissions';
import { useProjectMembers } from '../projects/hooks';
import AddTaskForm from './AddTasksForm';
import BoardColumn from './Boardcolumn';
import TaskDialog from './TaskDialog';
import { STATUSES } from './constants';
import { useBoard, useMoveTask, usePendingMoveIds, useTaskEvents } from './hooks';

const CONFLICT_CODES = ['TASK_VERSION_CONFLICT', 'POSITION_CONFLICT'];

export default function TaskBoard({ workspace, project }) {
  const { data: board, isLoading, isError, error, refetch } = useBoard(workspace.id, project.id);
  const { data: team = [] } = useProjectMembers(workspace.id, project.id);
  const move = useMoveTask(workspace.id, project.id);
  const pendingIds = usePendingMoveIds(project.id);
  // A notification can deep-link straight to a task: ?task=<id> opens its dialog
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState(() => searchParams.get('task'));
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const taskParam = searchParams.get('task');
    if (taskParam) setOpenId(taskParam);
  }, [searchParams]);

  const closeDialog = () => {
    setOpenId(null);
    if (searchParams.has('task')) {
      const next = new URLSearchParams(searchParams);
      next.delete('task');
      setSearchParams(next, { replace: true });
    }
  };

  // Live updates from other users (Phase 8); a dismissed task closes its dialog too
  useTaskEvents(workspace.id, project.id, {
    onDeleted: (taskId) => setOpenId((current) => (current === taskId ? null : current)),
  });

  const archived = project.status === 'archived';
  const canMove = hasPermission(workspace, 'task:update') && !archived;
  const canCreate = hasPermission(workspace, 'task:create') && !archived;
  const names = useMemo(() => new Map(team.map((m) => [m.userId, m.name])), [team]);

  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination || !board) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const task = board.columns[source.droppableId]?.tasks.find((t) => t.id === draggableId);
    if (!task) return;

    const status = destination.droppableId;
    // The target column without the dragged card: its neighbours are what the server needs
    const others = board.columns[status].tasks.filter((t) => t.id !== draggableId);

    setNotice(null);
    move.mutate(
      {
        taskId: task.id,
        version: task.version,
        status,
        prevId: others[destination.index - 1]?.id ?? null,
        nextId: others[destination.index]?.id ?? null,
        index: destination.index,
      },
      {
        onError: (err) =>
          setNotice(
            CONFLICT_CODES.includes(err.code)
              ? 'Someone else changed this board, so your move was undone and the board was refreshed.'
              : err.message
          ),
      }
    );
  };

  return (
    <section className="space-y-3" aria-label="Task board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-gradient">Tasks</span>
        </h2>
        {archived && (
          <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-700 ring-1 ring-amber-200">
            This project is archived, so its board is read-only.
          </p>
        )}
      </div>

      {canCreate && <AddTaskForm workspaceId={workspace.id} projectId={project.id} />}

      {notice && (
        <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {notice}
        </p>
      )}

      {isLoading && <FullPageSpinner />}
      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error.message}{' '}
          <button onClick={() => refetch()} className="font-medium underline hover:text-rose-800">Retry</button>
        </p>
      )}

      {board && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map((status) => (
              <BoardColumn
                key={status.key}
                status={status}
                column={board.columns[status.key]}
                names={names}
                canMove={canMove}
                pendingIds={pendingIds}
                onOpen={setOpenId}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      {openId && (
        <TaskDialog
          key={openId}
          workspace={workspace}
          project={project}
          taskId={openId}
          team={team}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}