import { useState } from 'react';
import { useMembers, useUpdateMemberRole, useRemoveMember } from './hooks';
import { canManageMembers, outranks, ROLE_LABELS } from '../../lib/permissions';
import FullPageSpinner from '../../components/FullPageSpinner';

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
  if (isError) return <p className="text-red-600">{error.message}</p>;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Members ({members.length})</h2>
      {actionError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {members.map((m) => {
          const isMe = m.userId === myUserId;
          const manageable = canManageMembers(myRole) && !isMe && outranks(myRole, m.role);
          const assignable = ['admin', 'member', 'guest'].filter((r) => outranks(myRole, r));
          return (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {m.name} {isMe && <span className="text-xs text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-sm text-slate-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {manageable ? (
                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    onChange={(e) => run(updateRole, { id: workspaceId, userId: m.userId, role: e.target.value })}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                  >
                    {assignable.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{ROLE_LABELS[m.role]}</span>
                )}
                {manageable && (
                  <button
                    onClick={() => window.confirm(`Remove ${m.name}?`) && run(remove, { id: workspaceId, userId: m.userId })}
                    className="text-sm text-red-600 hover:underline"
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