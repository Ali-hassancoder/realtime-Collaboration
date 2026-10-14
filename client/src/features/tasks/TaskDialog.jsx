import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import FullPageSpinner from '../../components/FullPageSpinner';
import { hasPermission } from '../../lib/permissions';
import { PRIORITIES, PRIORITY_KEYS, STATUSES, STATUS_KEYS } from './constants';
import { useDeleteTask, useTask, useUpdateTask } from './hooks';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().trim().max(2000, 'Description is too long'),
  status: z.enum(STATUS_KEYS),
  priority: z.enum(PRIORITY_KEYS),
  assigneeId: z.string().optional(), // '' = unassigned
  dueDate: z.string(), // '' = none
});

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50';

function TaskForm({ task, workspace, project, team, canEdit, canAssign, canDelete, onNotice, onRequestClose }) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const ids = { workspaceId: workspace.id, projectId: project.id, taskId: task.id };

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ?? '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    },
  });

  const onSubmit = async (v) => {
    onNotice(null);
    try {
      await update.mutateAsync({
        ...ids,
        version: task.version,
        title: v.title,
        description: v.description,
        status: v.status,
        priority: v.priority,
        dueDate: v.dueDate || null,
        ...(canAssign ? { assigneeId: v.assigneeId || null } : {}),
      });
      onNotice({ ok: true, text: 'Saved.' });
    } catch (err) {
      onNotice({
        ok: false,
        text:
          err.code === 'TASK_VERSION_CONFLICT'
            ? 'Someone else changed this task, so your edit was not saved. The latest version is shown; review it and try again.'
            : err.message,
      });
    }
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this task permanently? This cannot be undone.')) return;
    onNotice(null);
    try {
      await del.mutateAsync(ids);
      onRequestClose();
    } catch (err) {
      onNotice({ ok: false, text: err.message });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <fieldset disabled={!canEdit} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Title
          <input {...register('title')} className={inputClass} aria-invalid={errors.title ? 'true' : 'false'} />
          {errors.title && <span role="alert" className="mt-1 block text-sm text-red-600">{errors.title.message}</span>}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea {...register('description')} rows={4} maxLength={2000} className={inputClass} />
          {errors.description && (
            <span role="alert" className="mt-1 block text-sm text-red-600">{errors.description.message}</span>
          )}
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select {...register('status')} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select {...register('priority')} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Assignee
            <select {...register('assigneeId')} disabled={!canAssign} className={inputClass}>
              <option value="">Unassigned</option>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <input type="date" {...register('dueDate')} className={inputClass} />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canEdit && (
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {update.isPending ? 'Saving...' : 'Save changes'}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={del.isPending}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Delete task
          </button>
        )}
      </div>
    </form>
  );
}

export default function TaskDialog({ workspace, project, taskId, team, onClose }) {
  const dialogRef = useRef(null);
  const { data: task, isLoading, isError, error } = useTask(workspace.id, project.id, taskId);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const requestClose = () => dialogRef.current?.close();
  const archived = project.status === 'archived';
  const canEdit = hasPermission(workspace, 'task:update') && !archived;
  const canAssign = hasPermission(workspace, 'task:assign');
  const canDelete = hasPermission(workspace, 'task:delete') && !archived;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop target the dialog element itself
        if (e.target === dialogRef.current) requestClose();
      }}
      aria-labelledby="task-dialog-title"
      // m-auto: Tailwind's reset removes the margin the browser uses to center modal dialogs
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="task-dialog-title" className="text-lg font-semibold">
            {canEdit ? 'Edit task' : 'Task'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            &times;
          </button>
        </div>

        {archived && <p className="text-sm text-amber-700">This project is archived, so tasks are read-only.</p>}
        {notice && (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
          >
            {notice.text}
          </p>
        )}

        {isLoading && <FullPageSpinner />}
        {isError && (
          <p role="alert" className="text-red-600">
            {error.status === 404 ? 'This task no longer exists.' : error.message}
          </p>
        )}
        {task && (
          // key={version}: when the server copy changes (after saving or a conflict) the form reloads from it
          <TaskForm
            key={task.version}
            task={task}
            workspace={workspace}
            project={project}
            team={team}
            canEdit={canEdit}
            canAssign={canAssign}
            canDelete={canDelete}
            onNotice={setNotice}
            onRequestClose={requestClose}
          />
        )}
      </div>
    </dialog>
  );
}