import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import FormField from '../../components/FormField';
import { changePassword } from '../../services/users';
import { AUTH_KEY } from '../auth/useAuth';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export default function PasswordForm() {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      // The server revoked all sessions; send the user back to login
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="glass-card space-y-4 rounded-2xl p-5">
      <h2 className="font-semibold">
        <span className="text-gradient">Change password</span>
      </h2>
      <p className="text-sm text-slate-500">You will be logged out on all devices afterwards.</p>
      {serverError && (
        <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {serverError}
        </p>
      )}
      <FormField label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
      <FormField label="New password" type="password" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword')} />
      <FormField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      <button type="submit" disabled={isSubmitting} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
        Change password
      </button>
    </form>
  );
}