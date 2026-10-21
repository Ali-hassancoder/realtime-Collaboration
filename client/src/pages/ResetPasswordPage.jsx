import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resetPassword } from '../services/auth';
import FormField from '../components/FormField';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);
  // An invalid/expired link is terminal: the only way forward is a fresh request
  const [linkDead, setLinkDead] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }) => {
    setServerError(null);
    try {
      await resetPassword(token, password);
      navigate('/login', { replace: true, state: { notice: 'Password updated. Log in with your new password.' } });
    } catch (err) {
      setServerError(err.message);
      if (err.code === 'RESET_LINK_INVALID') setLinkDead(true);
    }
  };

  if (linkDead) {
    return (
      <div className="mx-auto max-w-sm animate-scale-in">
        <div className="glass-card space-y-4 rounded-2xl p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold">
            <span className="text-gradient">Link no longer works</span>
          </h1>
          <p className="text-slate-600">{serverError}</p>
          <Link to="/forgot-password" className="btn-gradient block rounded-xl px-4 py-2.5 font-semibold">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">Choose a new password</span>
        </h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Your other devices will be signed out.</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError && (
            <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {serverError}
            </p>
          )}
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <FormField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <button type="submit" disabled={isSubmitting} className="btn-gradient w-full rounded-xl px-4 py-2.5 font-semibold">
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">
          Changed your mind?{' '}
          <Link to="/login" className="font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
