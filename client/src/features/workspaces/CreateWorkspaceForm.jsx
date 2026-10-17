import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import FormField from '../../components/FormField';
import { useCreateWorkspace } from './hooks';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  description: z.string().trim().max(500).optional(),
});

export default function CreateWorkspaceForm() {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const [serverError, setServerError] = useState(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const workspace = await create.mutateAsync({ name: values.name, description: values.description ?? '' });
      reset();
      navigate(`/workspaces/${workspace.id}`);
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="glass-card space-y-4 rounded-2xl p-5">
      <h2 className="font-semibold">
        <span className="text-gradient">Create a workspace</span>
      </h2>
      {serverError && (
        <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {serverError}
        </p>
      )}
      <FormField label="Name" error={errors.name?.message} {...register('name')} />
      <FormField label="Description (optional)" error={errors.description?.message} {...register('description')} />
      <button type="submit" disabled={create.isPending} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
        {create.isPending ? 'Creating...' : 'Create workspace'}
      </button>
    </form>
  );
}