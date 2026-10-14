import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from './hooks';
import CreateProjectForm from './CreateProjectForm';
import FullPageSpinner from '../../components/FullPageSpinner';
import { hasPermission } from '../../lib/permissions';

export default function ProjectList({ workspace }) {
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useProjects(workspace.id, { status, page });

  const canCreate = hasPermission(workspace, 'project:create');
  const isGuest = workspace.role === 'guest';
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const changeStatus = (next) => {
    setStatus(next);
    setPage(1);
  };

  const tab = (value, label) => (
    <button
      onClick={() => changeStatus(value)}
      aria-pressed={status === value}
      className={`rounded-lg px-3 py-1 text-sm ${
        status === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        <div className="flex items-center gap-2">
          {tab('active', 'Active')}
          {tab('archived', 'Archived')}
          {canCreate && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg border border-indigo-600 px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50"
            >
              New project
            </button>
          )}
        </div>
      </div>

      {showForm && <CreateProjectForm workspaceId={workspace.id} onCancel={() => setShowForm(false)} />}

      {isLoading && <FullPageSpinner />}
      {isError && (
        <p role="alert" className="text-red-600">
          {error.message} <button onClick={() => refetch()} className="underline">Retry</button>
        </p>
      )}

      {data?.projects.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          {status === 'archived'
            ? 'No archived projects.'
            : isGuest
              ? 'You have not been added to any projects yet.'
              : canCreate
                ? 'No projects yet. Create the first one.'
                : 'No projects yet. A project manager can create one.'}
        </p>
      )}

      {data?.projects.length > 0 && (
        <ul className={`grid gap-3 sm:grid-cols-2 ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {data.projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/workspaces/${workspace.id}/projects/${p.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-400"
              >
                <p className="font-semibold text-slate-900">{p.name}</p>
                <p className="line-clamp-2 text-sm text-slate-500">{p.description || 'No description'}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}