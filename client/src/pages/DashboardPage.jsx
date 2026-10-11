import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useWorkspaces } from '../features/workspaces/hooks';
import CreateWorkspaceForm from '../features/workspaces/CreateWorkspaceForm';
import FullPageSpinner from '../components/FullPageSpinner';
import { ROLE_LABELS } from '../lib/permissions';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: workspaces, isLoading, isError, error, refetch } = useWorkspaces();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="text-slate-600">Your workspaces</p>
      </div>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <p role="alert" className="text-red-600">
          {error.message}{' '}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </p>
      )}
      {workspaces?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          You are not in any workspace yet. Create one below, or open an invite link you received.
        </p>
      )}
      {workspaces?.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link to={`/workspaces/${w.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-400">
                <p className="font-semibold text-slate-900">{w.name}</p>
                <p className="line-clamp-2 text-sm text-slate-500">{w.description || 'No description'}</p>
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{ROLE_LABELS[w.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateWorkspaceForm />
    </section>
  );
}