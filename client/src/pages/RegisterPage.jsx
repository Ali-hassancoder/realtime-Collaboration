import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { registerUser } from '../services/auth';
import { AUTH_KEY } from '../features/auth/useAuth';
import FormField from '../components/FormField';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export default function RegisterPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ name, email, password }) => {
    setServerError(null);
    try {
      const user = await registerUser({ name, email, password });
      queryClient.setQueryData(AUTH_KEY, user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">Create your account</span>
        </h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Start collaborating with your team in minutes.</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError && (
            <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {serverError}
            </p>
          )}
          <FormField label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
          <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <FormField
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <FormField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <button type="submit" disabled={isSubmitting} className="btn-gradient w-full rounded-xl px-4 py-2.5 font-semibold">
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}