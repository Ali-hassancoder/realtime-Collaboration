import { useState } from 'react';
import { Link, Outlet, useLocation, useMatch } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/useAuth';
import { useSocketLifecycle } from '../features/realtime/useSocketLifecycle';
import NotificationBell from '../features/notifications/NotificationBell';
import VerifyEmailBanner from '../features/auth/VerifyEmailBanner';
import { logoutUser } from '../services/auth';

// Hamburger icon (inline SVG so we do not add an icon library dependency)
function MenuIcon({ open }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      {open ? (
        <>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </>
      ) : (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </>
      )}
    </svg>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  useSocketLifecycle(user);
  // The project board needs more room than the other pages
  const wide = useMatch('/workspaces/:workspaceId/projects/:projectId');
  const widthClass = wide ? 'max-w-6xl' : 'max-w-3xl';
  const queryClient = useQueryClient();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    try {
      await logoutUser();
    } finally {
      // Clear all cached data so the next user never sees the previous user's data
      queryClient.clear();
      queryClient.setQueryData(['auth', 'me'], null);
    }
  };

  // Close the mobile menu on navigation
  const closeOnNav = () => setMobileMenuOpen(false);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Decorative animated gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 animate-blob rounded-full bg-gradient-to-br from-indigo-300/40 to-violet-400/40 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 animate-blob rounded-full bg-gradient-to-br from-fuchsia-300/40 to-pink-400/30 blur-3xl [animation-delay:2s]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 animate-blob rounded-full bg-gradient-to-br from-cyan-200/40 to-sky-300/40 blur-3xl [animation-delay:4s]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className={`mx-auto flex ${widthClass} items-center justify-between px-3 py-3 sm:px-4`}>
          <Link to="/" className="group flex items-center gap-2">
            <img
              src="/favicon.png"
              alt="Syncora logo"
              className="h-8 w-8 rounded-lg object-cover shadow-lg shadow-violet-500/30 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
            />
            <span className="text-gradient-animated text-lg font-extrabold tracking-tight">SYNCORA</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 text-sm sm:flex sm:gap-2">
            <Link
              to="/status"
              className="rounded-full px-3 py-1.5 text-slate-600 transition-colors hover:bg-white/80 hover:text-violet-700"
            >
              Status
            </Link>
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="rounded-full px-3 py-1.5 text-slate-600 transition-colors hover:bg-white/80 hover:text-violet-700"
                >
                  Dashboard
                </Link>
                <NotificationBell />
                <Link
                  to="/profile"
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] font-bold text-white">
                    {user.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                  <span className="max-w-[9rem] truncate font-medium">{user.name}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-full px-3 py-1.5 font-medium text-rose-600 transition-colors hover:bg-rose-50"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full px-3 py-1.5 text-slate-600 transition-colors hover:bg-white/80 hover:text-violet-700"
                >
                  Log in
                </Link>
                <Link to="/register" className="btn-gradient rounded-full px-4 py-1.5 font-medium">
                  Sign up
                </Link>
              </>
            )}
          </nav>

          {/* Mobile: notification bell + hamburger toggle */}
          {user && (
            <div className="sm:hidden">
              <NotificationBell />
            </div>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-white/80 sm:hidden"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            <MenuIcon open={mobileMenuOpen} />
          </button>
        </div>

        {/* Mobile slide-down menu */}
        {mobileMenuOpen && (
          <nav className="animate-fade-in border-t border-slate-100 bg-white/95 px-4 pb-4 pt-2 backdrop-blur-xl sm:hidden" role="navigation">
            <ul className="space-y-1 text-sm font-medium">
              <li>
                <Link to="/status" onClick={closeOnNav} className="block rounded-xl px-3 py-2.5 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700">
                  Status
                </Link>
              </li>
              {user ? (
                <>
                  <li>
                    <Link to="/dashboard" onClick={closeOnNav} className="block rounded-xl px-3 py-2.5 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700">
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" onClick={closeOnNav} className="block rounded-xl px-3 py-2.5 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700">
                      Profile ({user.name})
                    </Link>
                  </li>
                  <li>
                    <button onClick={handleLogout} className="w-full rounded-xl px-3 py-2.5 text-left font-medium text-rose-600 transition-colors hover:bg-rose-50">
                      Log out
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link to="/login" onClick={closeOnNav} className="block rounded-xl px-3 py-2.5 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" onClick={closeOnNav} className="btn-gradient block rounded-xl px-3 py-2.5 text-center font-semibold">
                      Sign up
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        )}
      </header>

      <main className={`mx-auto ${widthClass} px-3 py-6 sm:px-4 sm:py-8`}>
        <VerifyEmailBanner />
        {/* Re-key on pathname so each page fades in */}
        <div key={location.pathname} className="animate-fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
