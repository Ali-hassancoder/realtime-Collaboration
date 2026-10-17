import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite } from '../features/workspaces/hooks';

export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const [error, setError] = useState(null);

  const onAccept = async () => {
    setError(null);
    try {
      const workspace = await accept.mutateAsync(token);
      navigate(`/workspaces/${workspace.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card space-y-4 rounded-2xl p-6 text-center sm:p-8">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">You have been invited</span>
        </h1>
        <p className="text-slate-600">Accept to join the workspace. You must be logged in with the invited email address.</p>
        {error && (
          <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
        <button
          onClick={onAccept}
          disabled={accept.isPending}
          className="btn-gradient w-full rounded-xl px-4 py-2.5 font-semibold"
        >
          {accept.isPending ? 'Joining...' : 'Accept invitation'}
        </button>
        <div>
          <Link
            to="/dashboard"
            className="text-sm font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}