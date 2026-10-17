import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import FormField from '../../components/FormField';
import { updateProfile } from '../../services/users';
import { AUTH_KEY } from '../auth/useAuth';

const schema = z.object({ name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50) });

export default function ProfileForm({ user }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
  });

  const onSubmit = async (values) => {
    setMessage(null);
    try {
      const updated = await updateProfile(values);
      queryClient.setQueryData(AUTH_KEY, updated);
      setMessage({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="glass-card space-y-4 rounded-2xl p-5">
      <h2 className="font-semibold">
        <span className="text-gradient">Profile</span>
      </h2>
      {message && (
        <p
          role="status"
          className={`animate-fade-in rounded-lg px-3 py-2 text-sm ring-1 ${
            message.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {message.text}
        </p>
      )}
      <p className="text-sm text-slate-500">Email: {user.email}</p>
      <FormField label="Name" error={errors.name?.message} {...register('name')} />
      <button type="submit" disabled={isSubmitting} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
        Save
      </button>
    </form>
  );
}