import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import FormField from '../../components/FormField';
import RoleBadge from '../../components/RoleBadge';
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
      <h2 className="text-lg font-semibold">
        <span className="text-gradient">Invite people</span>
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="glass-card space-y-3 rounded-2xl p-5">
        {error && (
          <p role="alert" className="animate-fade-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
        <FormField label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <div>
          <label htmlFor="invite-role" className="mb-1 block text-sm font-medium text-slate-700">Role</label>
          <select
            id="invite-role"
            {...register('role')}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={create.isPending} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
          {create.isPending ? 'Creating...' : 'Create invite link'}
        </button>
      </form>

      {link && (
        <div role="status" className="animate-fade-up rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 text-sm">
          <p className="mb-2 text-emerald-900">
            Share this link with <strong>{link.email}</strong>. It is shown only once and works only for that email address.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              aria-label="Invite link"
              className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5"
            />
            <button
              onClick={copy}
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 font-medium text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Pending invitations</h3>
          <ul className="stagger glass-card divide-y divide-slate-100 rounded-2xl">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  {inv.email} <RoleBadge role={inv.role} />
                </span>
                <button
                  onClick={() => remove.mutate({ id: workspaceId, inviteId: inv.id })}
                  className="font-medium text-rose-600 transition-colors hover:text-rose-700 hover:underline"
                >
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