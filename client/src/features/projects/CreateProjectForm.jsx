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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {serverError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <FormField label="Project name" error={errors.name?.message} {...register('name')} />
      <FormField label="Description (optional)" error={errors.description?.message} {...register('description')} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {create.isPending ? 'Creating...' : 'Create project'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}