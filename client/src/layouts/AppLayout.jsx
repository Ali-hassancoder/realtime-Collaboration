import { Link, Outlet, useMatch } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/useAuth';
import { logoutUser } from '../services/auth';

export default function AppLayout() {
  const { user } = useAuth();
  // The project board needs more room than the other pages
  const wide = useMatch('/workspaces/:workspaceId/projects/:projectId');
  const widthClass = wide ? 'max-w-6xl' : 'max-w-3xl';
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      // Clear all cached data so the next user never sees the previous user's data
      queryClient.clear();
      queryClient.setQueryData(['auth', 'me'], null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex ${widthClass} items-center justify-between px-4 py-4`}>
          <Link to="/" className="font-semibold text-slate-900">
            SYNCORA 
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/status" className="text-slate-600 hover:text-slate-900">
              Status
            </Link>
            {user ? (
              <>
                <Link to="/dashboard" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
                <Link to="/profile" className="text-slate-600 hover:text-slate-900">{user.name}</Link>
                <button onClick={handleLogout} className="text-indigo-600 hover:underline">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-indigo-600 hover:underline">
                  Log in
                </Link>
                <Link to="/register" className="text-indigo-600 hover:underline">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={`mx-auto ${widthClass} px-4 py-8`}>
        <Outlet />
      </main>
    </div>
  );
}