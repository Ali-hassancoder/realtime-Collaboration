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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Profile</h2>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}
      <p className="text-sm text-slate-500">Email: {user.email}</p>
      <FormField label="Name" error={errors.name?.message} {...register('name')} />
      <button type="submit" disabled={isSubmitting}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        Save
      </button>
    </form>
  );
}