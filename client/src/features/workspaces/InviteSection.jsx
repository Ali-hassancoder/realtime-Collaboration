import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import FormField from '../../components/FormField';
import { useInvites, useCreateInvite, useDeleteInvite } from './hooks';
import { ASSIGNABLE_ROLES, outranks, ROLE_LABELS } from '../../lib/permissions';
const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
    role: z.enum(ASSIGNABLE_ROLES),
});

export default function InviteSection({ workspaceId, myRole }) {
  const { data: invites = [] } = useInvites(workspaceId, true);
  const create = useCreateInvite();
  const remove = useDeleteInvite();
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const roles = ASSIGNABLE_ROLES.filter((r) => outranks(myRole, r));
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'member' },
  });

  const onSubmit = async (values) => {
    setError(null);
    setCopied(false);
    try {
      const result = await create.mutateAsync({ id: workspaceId, ...values });
      setLink({ email: values.email, url: result.inviteUrl });
      reset({ email: '', role: 'member' });
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Invite people</h2>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <FormField label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <div>
          <label htmlFor="invite-role" className="mb-1 block text-sm font-medium text-slate-700">Role</label>
          <select id="invite-role" {...register('role')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {create.isPending ? 'Creating...' : 'Create invite link'}
        </button>
      </form>

      {link && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="mb-2 text-green-900">
            Share this link with <strong>{link.email}</strong>. It is shown only once and works only for that email address.
          </p>
          <div className="flex gap-2">
            <input readOnly value={link.url} aria-label="Invite link" className="w-full rounded border border-green-300 bg-white px-2 py-1" />
            <button onClick={copy} className="rounded bg-green-700 px-3 py-1 text-white">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Pending invitations</h3>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{inv.email} <span className="text-slate-500">({ROLE_LABELS[inv.role]})</span></span>
                <button onClick={() => remove.mutate({ id: workspaceId, inviteId: inv.id })} className="text-red-600 hover:underline">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}