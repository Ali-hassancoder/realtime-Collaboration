import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useWorkspace } from '../features/workspaces/hooks';
import ProjectList from '../features/projects/ProjectList';
import MemberList from '../features/workspaces/MemberList';
import InviteSection from '../features/workspaces/InviteSection';
import WorkspaceSettings from '../features/workspaces/WorkspaceSettings';
import FullPageSpinner from '../components/FullPageSpinner';
import { hasPermission, ROLE_LABELS } from '../lib/permissions';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { user } = useAuth();
  const { data: workspace, isLoading, isError, error } = useWorkspace(workspaceId);

  if (isLoading) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-900">{error.status === 404 ? 'Workspace not found' : 'Something went wrong'}</h1>
        <p className="mt-1 text-slate-600">{error.message}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-indigo-600 hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/dashboard" className="text-sm text-indigo-600 hover:underline">&larr; All workspaces</Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{workspace.name}</h1>
        <p className="text-slate-600">{workspace.description || 'No description'}</p>
        <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          Your role: {ROLE_LABELS[workspace.role]}
        </span>
      </div>
      <ProjectList workspace={workspace} />
      <MemberList workspaceId={workspace.id} myRole={workspace.role} myUserId={user.id} />
      {hasPermission(workspace, 'member:invite') && <InviteSection workspaceId={workspace.id} myRole={workspace.role} />}
      <WorkspaceSettings key={workspace.updatedAt} workspace={workspace} myUserId={user.id} />
    </div>
  );
}