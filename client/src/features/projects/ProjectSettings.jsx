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
      <h2 className="text-lg font-semibold">
        <span className="text-gradient">Project settings</span>
      </h2>
      {message && (
        <p
          role="status"
          className={`animate-fade-in rounded-lg px-3 py-2 text-sm ring-1 ${
            message.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {message.text}
        </p>
      )}
      {canUpdate && (
        <form onSubmit={save} className="glass-card space-y-3 rounded-2xl p-5">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={update.isPending} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
              Save changes
            </button>
            <button type="button" disabled={update.isPending}
              onClick={() => run(() => update.mutateAsync({ ...ids, status: archived ? 'active' : 'archived' }), archived ? 'Project restored.' : 'Project archived.')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60">
              {archived ? 'Restore project' : 'Archive project'}
            </button>
          </div>
        </form>
      )}
      {canDelete && (
        <button onClick={onDelete} disabled={del.isPending}
          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60">
          Delete project
        </button>
      )}
    </section>
  );
}

