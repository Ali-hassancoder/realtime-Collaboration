import { useState } from 'react';
import { useMembers, useUpdateMemberRole, useRemoveMember } from './hooks';
import { ASSIGNABLE_ROLES, canManageMembers, outranks, ROLE_LABELS } from '../../lib/permissions';
import FullPageSpinner from '../../components/FullPageSpinner';
import RoleBadge from '../../components/RoleBadge';

export default function MemberList({ workspaceId, myRole, myUserId }) {
  const { data: members, isLoading, isError, error } = useMembers(workspaceId);
  const updateRole = useUpdateMemberRole();
  const remove = useRemoveMember();
  const [actionError, setActionError] = useState(null);

  const run = async (mutation, vars) => {
    setActionError(null);
    try {
      await mutation.mutateAsync(vars);
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <p className="text-rose-600">{error.message}</p>;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        Members{' '}
        <span className="ml-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">{members.length}</span>
      </h2>
      {actionError && (
        <p role="alert" className="animate-fade-in mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {actionError}
        </p>
      )}
      <ul className="stagger glass-card divide-y divide-slate-100 rounded-2xl">
        {members.map((m) => {
          const isMe = m.userId === myUserId;
          const manageable = canManageMembers(myRole) && !isMe && outranks(myRole, m.role);
          const assignable = ASSIGNABLE_ROLES.filter((r) => outranks(myRole, r));
          return (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-sm font-bold text-white">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {m.name} {isMe && <span className="text-xs text-slate-500">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {manageable ? (
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    onChange={(e) => run(updateRole, { id: workspaceId, userId: m.userId, role: e.target.value })}
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  >
                    {assignable.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {manageable && (
                  <button
                    onClick={() => window.confirm(`Remove ${m.name}?`) && run(remove, { id: workspaceId, userId: m.userId })}
                    className="text-sm font-medium text-rose-600 transition-colors hover:text-rose-700 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}