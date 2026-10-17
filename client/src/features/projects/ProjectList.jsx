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
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
        status === value
          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm shadow-violet-500/30'
          : 'text-slate-600 hover:bg-white/80 hover:text-violet-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-gradient">Projects</span>
        </h2>
        <div className="flex items-center gap-2">
          {tab('active', 'Active')}
          {tab('archived', 'Archived')}
          {canCreate && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl border border-violet-300 bg-white px-3.5 py-1.5 text-sm font-medium text-violet-600 shadow-sm transition-colors hover:bg-violet-50"
            >
              New project
            </button>
          )}
        </div>
      </div>

      {showForm && <CreateProjectForm workspaceId={workspace.id} onCancel={() => setShowForm(false)} />}

      {isLoading && <FullPageSpinner />}
      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error.message}{' '}
          <button onClick={() => refetch()} className="font-medium underline hover:text-rose-800">Retry</button>
        </p>
      )}

      {data?.projects.length === 0 && (
        <p className="rounded-2xl border-2 border-dashed border-violet-200 bg-white/60 p-6 text-center text-slate-600">
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
        <ul className={`stagger grid gap-3 sm:grid-cols-2 ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {data.projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/workspaces/${workspace.id}/projects/${p.id}`}
                className="glass-card card-glow group block rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-500 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition-transform duration-300 group-hover:scale-110">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="line-clamp-2 text-sm text-slate-500">{p.description || 'No description'}</p>
                  </div>
                </div>
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
            className="rounded-lg px-3 py-1 transition-colors hover:bg-white/80 hover:text-violet-700 disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg px-3 py-1 transition-colors hover:bg-white/80 hover:text-violet-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}