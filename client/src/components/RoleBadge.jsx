import { ROLE_LABELS, ROLE_STYLES } from '../lib/permissions.js';

export default function RoleBadge({ role }) {
  if (!role) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${
        ROLE_STYLES[role] ?? 'bg-slate-200 text-slate-700'
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
