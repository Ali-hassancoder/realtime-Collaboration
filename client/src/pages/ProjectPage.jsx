import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../features/workspaces/hooks';
import { useProject } from '../features/projects/hooks';
import { useRoom } from '../features/realtime/useRoom';
import LiveBadge from '../features/realtime/LiveBadge';
import TaskBoard from '../features/tasks/TaskBoard';
import ProjectChat from '../features/chat/ProjectChat';
import ActivityFeed from '../features/activity/ActivityFeed';
import ProjectTeam from '../features/projects/ProjectTeam';
import ProjectSettings from '../features/projects/ProjectSettings';
import FullPageSpinner from '../components/FullPageSpinner';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams();
  const workspaceQuery = useWorkspace(workspaceId);
  const projectQuery = useProject(workspaceId, projectId);
  const room = useRoom({ type: 'project', workspaceId, projectId });

  if (workspaceQuery.isLoading || projectQuery.isLoading) return <FullPageSpinner />;

  const failure = workspaceQuery.error ?? projectQuery.error;
  if (failure) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-bold text-slate-900">
          {failure.status === 404 ? 'Project not found' : 'Something went wrong'}
        </h1>
        <p className="mt-1 text-slate-600">{failure.message}</p>
        <Link to={`/workspaces/${workspaceId}`} className="btn-gradient mt-5 inline-block rounded-xl px-4 py-2 text-sm font-semibold">
          Back to workspace
        </Link>
      </div>
    );
  }

  const workspace = workspaceQuery.data;
  const project = projectQuery.data;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/workspaces/${workspace.id}`} className="text-sm font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
          &larr; {workspace.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold">
            <span className="text-gradient">{project.name}</span>
          </h1>
          {project.status === 'archived' && (
            <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
              Archived
            </span>
          )}
          <LiveBadge status={room.status} error={room.error} />
        </div>
        <p className="mt-1 text-slate-600">{project.description || 'No description'}</p>
      </div>

      <TaskBoard workspace={workspace} project={project} />

      {/* Phase 9 + 10: live chat and the project activity feed */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectChat workspace={workspace} project={project} />
        <ActivityFeed workspace={workspace} project={project} />
      </div>

      <ProjectTeam workspace={workspace} project={project} />
      <ProjectSettings key={project.updatedAt} workspace={workspace} project={project} />
    </div>
  );
}