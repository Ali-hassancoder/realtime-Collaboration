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
      <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}
      {canEdit && (
        <form onSubmit={save} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" disabled={update.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            Save changes
          </button>
        </form>
      )}
      {isOwner ? (
        <button
          onClick={() => guarded(() => del.mutateAsync(workspace.id), `Delete "${workspace.name}" permanently? This cannot be undone.`)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Delete workspace
        </button>
      ) : (
        <button
          onClick={() => guarded(() => leave.mutateAsync({ id: workspace.id, userId: myUserId }), `Leave "${workspace.name}"?`)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Leave workspace
        </button>
      )}
    </section>
  );
}