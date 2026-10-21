import { fullTime, timeAgo } from '../../lib/format';
import { STATUSES } from '../tasks/constants';
import { useActivity, useActivityEvents } from './hooks';

const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

const FIELD_LABELS = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  dueDate: 'due date',
  assigneeId: 'assignee',
};

// A colorful dot per entry type keeps the feed scannable
const TYPE_STYLES = {
  'task.created': 'from-emerald-400 to-teal-500',
  'task.updated': 'from-sky-400 to-blue-500',
  'task.moved': 'from-violet-400 to-purple-500',
  'task.deleted': 'from-rose-400 to-red-500',
  'comment.created': 'from-amber-400 to-orange-500',
};

const TaskTitle = ({ children }) => <span className="font-medium text-slate-800">{children}</span>;

// Renders the sentence after the actor name, e.g. "moved Fix login from To do to In progress"
function describe(activity) {
  const title = activity.meta?.title ?? 'a task';
  switch (activity.type) {
    case 'task.created':
      return <>created task <TaskTitle>{title}</TaskTitle></>;
    case 'task.updated': {
      const fields = (activity.meta?.fields ?? []).map((f) => FIELD_LABELS[f] ?? f);
      return (
        <>
          updated <TaskTitle>{title}</TaskTitle>
          {fields.length > 0 && <span className="text-slate-500"> ({fields.join(', ')})</span>}
        </>
      );
    }
    case 'task.moved':
      return (
        <>
          moved <TaskTitle>{title}</TaskTitle> from {STATUS_LABELS[activity.meta?.from] ?? activity.meta?.from} to{' '}
          {STATUS_LABELS[activity.meta?.to] ?? activity.meta?.to}
        </>
      );
    case 'task.deleted':
      return <>deleted task <TaskTitle>{title}</TaskTitle></>;
    case 'comment.created':
      return (
        <>
          commented on <TaskTitle>{activity.meta?.taskTitle ?? 'a task'}</TaskTitle>
          {activity.meta?.excerpt && <span className="text-slate-500">: &ldquo;{activity.meta.excerpt}&rdquo;</span>}
        </>
      );
    default:
      return <>{activity.type}</>;
  }
}

function ActivityItem({ activity }) {
  return (
    <li className="flex animate-fade-in gap-3">
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-r ${
          TYPE_STYLES[activity.type] ?? 'from-slate-300 to-slate-400'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{activity.actor?.name ?? 'Someone'}</span> {describe(activity)}
        </p>
        <time title={fullTime(activity.createdAt)} className="text-xs text-slate-400">
          {timeAgo(activity.createdAt)}
        </time>
      </div>
    </li>
  );
}

// Phase 9: the project's activity feed. Entries are recorded server-side by the task and
// comment flows and pushed live through useActivityEvents (docs/SOCKET_EVENTS.md).
export default function ActivityFeed({ workspace, project }) {
  const query = useActivity(workspace.id, project.id);
  useActivityEvents(workspace.id, project.id);

  // Pages are newest-first, so the display order is the page order
  const activities = query.data ? query.data.pages.flatMap((page) => page.activities) : [];

  return (
    <section className="glass-card flex min-h-[18rem] flex-col rounded-2xl p-4 sm:min-h-[24rem] sm:p-5" aria-label="Project activity">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-gradient">Activity</span>
        </h2>
        {query.hasNextPage && (
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="text-xs font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline"
          >
            {query.isFetchingNextPage ? 'Loading...' : 'Load older'}
          </button>
        )}
      </div>

      <div className="mt-3 max-h-80 flex-1 overflow-y-auto pr-1">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">Loading activity...</p>
        ) : query.isError ? (
          <p role="alert" className="text-sm text-rose-600">
            {query.error.message}
          </p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet. Changes show up here as the team works.</p>
        ) : (
          <ul className="space-y-4">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
