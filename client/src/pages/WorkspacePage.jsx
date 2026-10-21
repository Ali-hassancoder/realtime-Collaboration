import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useWorkspace } from '../features/workspaces/hooks';
import ProjectList from '../features/projects/ProjectList';
import MemberList from '../features/workspaces/MemberList';
import InviteSection from '../features/workspaces/InviteSection';
import WorkspaceSettings from '../features/workspaces/WorkspaceSettings';
import FullPageSpinner from '../components/FullPageSpinner';
import RoleBadge from '../components/RoleBadge';
import { hasPermission } from '../lib/permissions';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { user } = useAuth();
  const { data: workspace, isLoading, isError, error } = useWorkspace(workspaceId);

  if (isLoading) return <FullPageSpinner />;
  if (isError) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-bold text-slate-900">{error.status === 404 ? 'Workspace not found' : 'Something went wrong'}</h1>
        <p className="mt-1 text-slate-600">{error.message}</p>
        <Link to="/dashboard" className="btn-gradient mt-5 inline-block rounded-xl px-4 py-2 text-sm font-semibold">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <Link to="/dashboard" className="text-sm font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
          &larr; All workspaces
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          <span className="text-gradient">{workspace.name}</span>
        </h1>
        <p className="mt-1 text-slate-600">{workspace.description || 'No description'}</p>
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          Your role: <RoleBadge role={workspace.role} />
        </div>
      </div>
      <ProjectList workspace={workspace} />
      <MemberList workspaceId={workspace.id} myRole={workspace.role} myUserId={user.id} />
      {hasPermission(workspace, 'member:invite') && <InviteSection workspaceId={workspace.id} myRole={workspace.role} />}
      <WorkspaceSettings key={workspace.updatedAt} workspace={workspace} myUserId={user.id} />
    </div>
  );
}