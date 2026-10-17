import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateWorkspace, useDeleteWorkspace, useRemoveMember } from './hooks';

export default function WorkspaceSettings({ workspace, myUserId }) {
  const navigate = useNavigate();
  const update = useUpdateWorkspace();
  const del = useDeleteWorkspace();
  const leave = useRemoveMember();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [message, setMessage] = useState(null);
  const isOwner = workspace.role === 'owner';
  const canEdit = isOwner || workspace.role === 'admin';

  const save = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      await update.mutateAsync({ id: workspace.id, name, description });
      setMessage({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  const guarded = async (fn, confirmText) => {
    if (!window.confirm(confirmText)) return;
    try {
      await fn();
      navigate('/dashboard');
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        <span className="text-gradient">Settings</span>
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
      {canEdit && (
        <form onSubmit={save} className="glass-card space-y-3 rounded-2xl p-5">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </label>
          <button type="submit" disabled={update.isPending} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
            Save changes
          </button>
        </form>
      )}
      {isOwner ? (
        <button
          onClick={() => guarded(() => del.mutateAsync(workspace.id), `Delete "${workspace.name}" permanently? This cannot be undone.`)}
          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50"
        >
          Delete workspace
        </button>
      ) : (
        <button
          onClick={() => guarded(() => leave.mutateAsync({ id: workspace.id, userId: myUserId }), `Leave "${workspace.name}"?`)}
          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50"
        >
          Leave workspace
        </button>
      )}
    </section>
  );
}