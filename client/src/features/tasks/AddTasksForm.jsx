import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTask } from './hooks';

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a task title').max(200, 'Title is too long'),
});

export default function AddTaskForm({ workspaceId, projectId }) {
  const create = useCreateTask();
  const [serverError, setServerError] = useState(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ title }) => {
    setServerError(null);
    try {
      await create.mutateAsync({ workspaceId, projectId, title });
      reset();
    } catch (err) {
      setServerError(err.message);
    }
  };

  const message = errors.title?.message ?? serverError;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <div className="flex gap-2">
        <label htmlFor="new-task-title" className="sr-only">New task title</label>
        <input
          id="new-task-title"
          autoComplete="off"
          placeholder="Add a task to To do..."
          aria-invalid={message ? 'true' : 'false'}
          {...register('title')}
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="btn-gradient shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Add
        </button>
      </div>
      {message && <p role="alert" className="animate-fade-in text-sm text-rose-600">{message}</p>}
    </form>
  );
}