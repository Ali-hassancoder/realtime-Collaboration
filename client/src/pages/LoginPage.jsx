import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { loginUser } from '../services/auth';
import { AUTH_KEY } from '../features/auth/useAuth';
import FormField from '../components/FormField';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const user = await loginUser(values);
      queryClient.setQueryData(AUTH_KEY, user);
      navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-sm animate-scale-in">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold">
          <span className="text-gradient">Log in</span>
        </h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Welcome back — pick up right where you left off.</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError && (
            <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {serverError}
            </p>
          )}
          <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <FormField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <button type="submit" disabled={isSubmitting} className="btn-gradient w-full rounded-xl px-4 py-2.5 font-semibold">
            {isSubmitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">
          No account?{' '}
          <Link to="/register" className="font-medium text-violet-600 transition-colors hover:text-fuchsia-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}