import { Droppable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';

export default function BoardColumn({ status, column, names, canMove, pendingIds, onOpen }) {
  const shown = column.tasks.length;
  const headingId = `column-${status.key}`;

  return (
    <section aria-labelledby={headingId} className={`flex min-w-64 flex-1 flex-col rounded-2xl p-2 ring-1 ${status.columnClass}`}>
      <h3 id={headingId} className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden="true" />
          {status.label}
        </span>
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-normal text-slate-600 shadow-sm">
          {column.total > shown ? `${shown} of ${column.total}` : column.total}
        </span>
      </h3>

      <Droppable droppableId={status.key}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-24 flex-1 space-y-2 rounded-xl p-1 transition-all duration-200 ${
              snapshot.isDraggingOver ? 'bg-white/80 ring-2 ring-violet-300' : ''
            }`}
          >
            {column.tasks.map((task, index) => {
              const saving = pendingIds.includes(task.id);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  assigneeName={task.assigneeId ? names.get(task.assigneeId) : null}
                  disabled={!canMove || saving}
                  saving={saving}
                  onOpen={onOpen}
                />
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {column.total > shown && (
        <p className="mt-2 px-1 text-xs text-slate-500">Showing the first {shown} tasks.</p>
      )}
    </section>
  );
}