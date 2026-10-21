import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forgotPassword } from '../services/auth';
import FormField from '../components/FormField';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState(null);
  const [sentTo, setSentTo] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }) => {
    setServerError(null);
    try {
      await forgotPassword(email);
      // The API answers the same for known and unknown emails, so the UI always says "check your inbox"
      setSentTo(email);
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">Reset your password</span>
        </h1>
        {sentTo ? (
          <>
            <p className="mb-6 mt-2 text-sm text-slate-600">
              If <span className="font-medium text-slate-800">{sentTo}</span> has an account, a reset link is on its
              way. The link works once and expires within an hour.
            </p>
            <button
              onClick={() => setSentTo(null)}
              className="w-full rounded-xl border border-violet-300 bg-white px-4 py-2.5 font-medium text-violet-600 transition-colors hover:bg-violet-50"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className="mb-6 mt-1 text-sm text-slate-500">
              Enter your account email and we will send you a link to choose a new password.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {serverError && (
                <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                  {serverError}
                </p>
              )}
              <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
              <button type="submit" disabled={isSubmitting} className="btn-gradient w-full rounded-xl px-4 py-2.5 font-semibold">
                {isSubmitting ? 'Sending link...' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="mt-5 text-sm text-slate-600">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
