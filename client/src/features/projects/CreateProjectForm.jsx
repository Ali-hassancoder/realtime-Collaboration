import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import FormField from '../../components/FormField';
import { useCreateProject } from './hooks';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(1000).optional(),
});

export default function CreateProjectForm({ workspaceId, onCancel }) {
  const navigate = useNavigate();
  const create = useCreateProject();
  const [serverError, setServerError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const project = await create.mutateAsync({
        workspaceId,
        name: values.name,
        description: values.description ?? '',
      });
      navigate(`/workspaces/${workspaceId}/projects/${project.id}`);
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="glass-card animate-fade-up space-y-3 rounded-2xl p-5">
      {serverError && (
        <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {serverError}
        </p>
      )}
      <FormField label="Project name" error={errors.name?.message} {...register('name')} />
      <FormField label="Description (optional)" error={errors.description?.message} {...register('description')} />
      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
          {create.isPending ? 'Creating...' : 'Create project'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white/80 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}