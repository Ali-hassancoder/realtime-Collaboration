import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resendVerification } from '../../services/auth';
import { useAuth, AUTH_KEY } from './useAuth';

// Soft enforcement (Phase 16): unverified users can work, but a reminder sits on top of
// every page until the email link is used. Dismissed for the session only - it reappears
// on the next load, which is acceptable for a nudge.
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);

  if (!user || user.emailVerified || dismissed) return null;

  const onResend = async () => {
    setState('sending');
    setError(null);
    try {
      await resendVerification();
      setState('sent');
    } catch (err) {
      if (err.code === 'EMAIL_ALREADY_VERIFIED') {
        // The server knows better than the cache: refresh it and the banner goes away
        queryClient.invalidateQueries({ queryKey: AUTH_KEY });
        return;
      }
      setError(err.message);
      setState('error');
    }
  };

  return (
    <div className="mb-6" role="status">
      <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50/90 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 backdrop-blur">
        <p>
          <span className="font-semibold">Verify your email</span> — we sent a link to{' '}
          <span className="font-medium">{user.email}</span>.{' '}
          {state === 'sent' && <span className="font-medium">A new one is on its way.</span>}
          {state === 'error' && <span className="font-medium text-rose-700">{error}</span>}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onResend}
            disabled={state === 'sending'}
            className="rounded-lg bg-white px-3 py-1.5 font-medium text-amber-700 shadow-sm ring-1 ring-amber-200 transition-colors hover:bg-amber-100 disabled:opacity-60"
          >
            {state === 'sending' ? 'Sending...' : 'Resend link'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss verification reminder"
            className="rounded-lg px-2 py-1.5 text-amber-600 transition-colors hover:bg-amber-100"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
