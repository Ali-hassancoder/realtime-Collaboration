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
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">You have been invited</h1>
      <p className="text-slate-600">Accept to join the workspace. You must be logged in with the invited email address.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={onAccept}
        disabled={accept.isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {accept.isPending ? 'Joining...' : 'Accept invitation'}
      </button>
      <div><Link to="/dashboard" className="text-sm text-indigo-600 hover:underline">Back to dashboard</Link></div>
    </div>
  );
}