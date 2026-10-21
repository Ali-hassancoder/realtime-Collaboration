import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { verifyEmail } from '../services/auth';
import { AUTH_KEY } from '../features/auth/useAuth';

// The emailed link lands here. Verification is a public call, so this route works whether
// or not the visitor is currently logged in; when they are, the auth cache is invalidated
// so the banner in the layout disappears without a reload.
export default function VerifyEmailPage() {
  const { token } = useParams();
  const queryClient = useQueryClient();
  const [state, setState] = useState('verifying');
  const [message, setMessage] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // React StrictMode double-invokes effects in dev; the link is single-use, so guard it
    if (startedRef.current) return;
    startedRef.current = true;
    verifyEmail(token)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: AUTH_KEY });
        setState('verified');
      })
      .catch((err) => {
        setMessage(err.message);
        setState('failed');
      });
  }, [token, queryClient]);

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card space-y-4 rounded-2xl p-6 text-center sm:p-8">
        {state === 'verifying' && (
          <>
            <h1 className="text-2xl font-bold">
              <span className="text-gradient">Verifying…</span>
            </h1>
            <p className="text-slate-600">Checking your link.</p>
          </>
        )}
        {state === 'verified' && (
          <>
            <h1 className="text-2xl font-bold">
              <span className="text-gradient">Email verified</span>
            </h1>
            <p className="text-slate-600">Your account is all set. Thanks for confirming your address.</p>
            <Link to="/dashboard" className="btn-gradient block rounded-xl px-4 py-2.5 font-semibold">
              Go to dashboard
            </Link>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="text-2xl font-bold">
              <span className="text-gradient">Verification failed</span>
            </h1>
            <p className="text-slate-600">{message}</p>
            <p className="text-sm text-slate-500">
              Links work once. Log in and request a new one from the banner at the top of the app.
            </p>
            <Link to="/login" className="btn-gradient block rounded-xl px-4 py-2.5 font-semibold">
              Go to log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
