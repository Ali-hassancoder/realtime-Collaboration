import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../features/workspaces/hooks';
import { useProject } from '../features/projects/hooks';
import TaskBoard from '../features/tasks/TaskBoard';
import ProjectTeam from '../features/projects/ProjectTeam';
import ProjectSettings from '../features/projects/ProjectSettings';
import FullPageSpinner from '../components/FullPageSpinner';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams();
  const workspaceQuery = useWorkspace(workspaceId);
  const projectQuery = useProject(workspaceId, projectId);

  if (workspaceQuery.isLoading || projectQuery.isLoading) return <FullPageSpinner />;

  const failure = workspaceQuery.error ?? projectQuery.error;
  if (failure) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-900">
          {failure.status === 404 ? 'Project not found' : 'Something went wrong'}
        </h1>
        <p className="mt-1 text-slate-600">{failure.message}</p>
        <Link to={`/workspaces/${workspaceId}`} className="mt-4 inline-block text-indigo-600 hover:underline">
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
        <Link to={`/workspaces/${workspace.id}`} className="text-sm text-indigo-600 hover:underline">
          &larr; {workspace.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          {project.status === 'archived' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Archived</span>
          )}
        </div>
        <p className="text-slate-600">{project.description || 'No description'}</p>
      </div>

      <TaskBoard workspace={workspace} project={project} />

      <ProjectTeam workspace={workspace} project={project} />
      <ProjectSettings key={project.updatedAt} workspace={workspace} project={project} />
    </div>
  );
}