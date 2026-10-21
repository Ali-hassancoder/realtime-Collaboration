import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useWorkspaces } from '../features/workspaces/hooks';
import CreateWorkspaceForm from '../features/workspaces/CreateWorkspaceForm';
import FullPageSpinner from '../components/FullPageSpinner';
import RoleBadge from '../components/RoleBadge';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: workspaces, isLoading, isError, error, refetch } = useWorkspaces();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          Welcome, <span className="text-gradient">{user.name}</span>
        </h1>
        <p className="mt-1 text-slate-600">Your workspaces</p>
      </div>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error.message}{' '}
          <button onClick={() => refetch()} className="font-medium underline hover:text-rose-800">Retry</button>
        </p>
      )}
      {workspaces?.length === 0 && (
        <p className="animate-fade-up rounded-2xl border-2 border-dashed border-violet-200 bg-white/60 p-8 text-center text-slate-600">
          You are not in any workspace yet. Create one below, or open an invite link you received.
        </p>
      )}
      {workspaces?.length > 0 && (
        <ul className="stagger grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link to={`/workspaces/${w.id}`} className="glass-card card-glow group block rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-lg font-bold text-white shadow-md shadow-violet-500/30 transition-transform duration-300 group-hover:scale-110">
                    {w.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{w.name}</p>
                    <p className="line-clamp-2 text-sm text-slate-500">{w.description || 'No description'}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <RoleBadge role={w.role} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateWorkspaceForm />
    </section>
  );
}