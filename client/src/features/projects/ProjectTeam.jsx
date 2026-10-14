import { useState } from 'react';
import { useProjectMembers, useAddProjectMember, useRemoveProjectMember } from './hooks';
import { useMembers } from '../workspaces/hooks';
import FullPageSpinner from '../../components/FullPageSpinner';
import { hasPermission, ROLE_LABELS } from '../../lib/permissions';

// Only rendered for people who can manage the team, so non-managers never fetch the workspace member list
function AddMember({ workspaceId, projectId, team, onError }) {
  const { data: wsMembers = [] } = useMembers(workspaceId);
  const add = useAddProjectMember();
  const [selected, setSelected] = useState('');

  const inTeam = new Set(team.map((m) => m.userId));
  const candidates = wsMembers.filter((m) => !inTeam.has(m.userId));
  if (candidates.length === 0) return <p className="text-sm text-slate-500">Everyone in the workspace is already on this project.</p>;

  const onAdd = async () => {
    onError(null);
    try {
      await add.mutateAsync({ workspaceId, projectId, userId: selected });
      setSelected('');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="flex gap-2">
      <select
        aria-label="Add a person to the project"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Add a person...</option>
        {candidates.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name} ({ROLE_LABELS[m.role]})
          </option>
        ))}
      </select>
      <button
        onClick={onAdd}
        disabled={!selected || add.isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        Add
      </button>
    </div>
  );
}

export default function ProjectTeam({ workspace, project }) {
  const { data: team, isLoading, isError, error } = useProjectMembers(workspace.id, project.id);
  const remove = useRemoveProjectMember();
  const [actionError, setActionError] = useState(null);
  const canManage = hasPermission(workspace, 'project:manage_members');

  const onRemove = async (member) => {
    if (!window.confirm(`Remove ${member.name} from this project?`)) return;
    setActionError(null);
    try {
      await remove.mutateAsync({ workspaceId: workspace.id, projectId: project.id, userId: member.userId });
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <p className="text-red-600">{error.message}</p>;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Team ({team.length})</h2>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {team.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{m.name}</p>
              <p className="truncate text-sm text-slate-500">{m.email}</p>
            </div>
            <div className="flex items-center gap-3">
              {m.workspaceRole && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{ROLE_LABELS[m.workspaceRole]}</span>
              )}
              {canManage && (
                <button onClick={() => onRemove(m)} className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canManage && <AddMember workspaceId={workspace.id} projectId={project.id} team={team} onError={setActionError} />}
    </section>
  );
}