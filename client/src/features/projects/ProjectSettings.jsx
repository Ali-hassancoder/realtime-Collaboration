import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateProject, useDeleteProject } from './hooks';
import { hasPermission } from '../../lib/permissions';

export default function ProjectSettings({ workspace, project }) {
  const navigate = useNavigate();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [message, setMessage] = useState(null);

  const canUpdate = hasPermission(workspace, 'project:update');
  const canDelete = hasPermission(workspace, 'project:delete');
  if (!canUpdate && !canDelete) return null;

  const ids = { workspaceId: workspace.id, projectId: project.id };
  const archived = project.status === 'archived';

  const run = async (fn, successText) => {
    setMessage(null);
    try {
      await fn();
      if (successText) setMessage({ ok: true, text: successText });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  const save = (e) => {
    e.preventDefault();
    run(() => update.mutateAsync({ ...ids, name, description }), 'Saved.');
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${project.name}" permanently? This cannot be undone.`)) return;
    run(async () => {
      await del.mutateAsync(ids);
      navigate(`/workspaces/${workspace.id}`);
    });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Project settings</h2>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}
      {canUpdate && (
        <form onSubmit={save} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              Save changes
            </button>
            <button type="button" disabled={update.isPending}
              onClick={() => run(() => update.mutateAsync({ ...ids, status: archived ? 'active' : 'archived' }), archived ? 'Project restored.' : 'Project archived.')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {archived ? 'Restore project' : 'Archive project'}
            </button>
          </div>
        </form>
      )}
      {canDelete && (
        <button onClick={onDelete} disabled={del.isPending}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
          Delete project
        </button>
      )}
    </section>
  );
}

