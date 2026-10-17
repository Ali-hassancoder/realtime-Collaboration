import { Draggable } from '@hello-pangea/dnd';
import { PRIORITY_BY_KEY } from './constants';

// en-CA formats as YYYY-MM-DD in the user's local time zone
const todayLocal = () => new Date().toLocaleDateString('en-CA');
// Due dates are calendar dates stored at UTC midnight, so format them in UTC
const formatDue = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function TaskCard({ task, index, assigneeName, disabled, saving, onOpen }) {
  const priority = PRIORITY_BY_KEY[task.priority];
  const overdue = Boolean(task.dueDate) && task.status !== 'done' && task.dueDate.slice(0, 10) < todayLocal();

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={disabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          // Defaults first: when dragging is disabled the card must still be focusable and clickable
          tabIndex={0}
          role="button"
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(task.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen(task.id); // Space is used by the library to lift the card
          }}
          className={`cursor-pointer rounded-xl border bg-white p-3 text-left shadow-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-violet-400 ${
            snapshot.isDragging
              ? 'rotate-1 border-violet-400 shadow-xl ring-2 ring-violet-300'
              : 'border-slate-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md'
          } ${saving ? 'opacity-70' : ''}`}
        >
          <p className="break-words text-sm font-medium text-slate-900">{task.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${priority.className}`}>{priority.label}</span>
            {task.dueDate &&
              (overdue ? (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600 ring-1 ring-rose-200">
                  Overdue: {formatDue(task.dueDate)}
                </span>
              ) : (
                <span className="text-slate-500">Due {formatDue(task.dueDate)}</span>
              ))}
            {assigneeName && (
              <span className="ml-auto flex items-center gap-1.5 text-slate-500">
                <span className="sr-only">Assigned to </span>
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-[10px] font-bold text-white"
                >
                  {assigneeName.charAt(0).toUpperCase()}
                </span>
                {assigneeName}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}