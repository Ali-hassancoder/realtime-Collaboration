import { hasPermission } from '../../lib/permissions';
import { useAuth } from '../auth/useAuth';
import { useDocument } from './useDocument';

// Phase 13: Project Notes - a single shared plain-text document per project, synchronized via Yjs
// (see `docs/ARCHITECTURE.md` for the CRDT rationale). Guests have `document:read` but not
// `document:edit`, so the textarea is disabled for them and the server enforces it again on every
// update. Archived projects are read-only for everything, so notes follow the same rule.

const AVATAR_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
];
const initials = (name) =>
  (name ?? '?')
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

function EditorStack({ subscribers, currentUserId }) {
  if (!subscribers || subscribers.length === 0) return null;
  // Deduplicate by user id (the server already does, but a stale client may not have caught the
  // last roster broadcast yet). Show max 5 avatars plus a count.
  const byUser = new Map();
  for (const s of subscribers) if (s?.id) byUser.set(s.id, s);
  const list = [...byUser.values()];
  const shown = list.slice(0, 5);
  const extra = list.length - shown.length;
  return (
    <div
      className="flex items-center gap-2"
      title={list.map((p) => p.name).join(', ')}
      aria-label={`${list.length} editors currently in notes`}
    >
      <div className="flex -space-x-2">
        {shown.map((person, i) => (
          <span
            key={person.id}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r text-[10px] font-bold text-white ring-2 ring-white ${
              AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
            } ${person.id === currentUserId ? 'opacity-100' : 'opacity-90'}`}
          >
            {initials(person.name)}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white">
            +{extra}
          </span>
        )}
      </div>
      <span className="text-xs text-slate-500">
        {list.length === 1 ? '1 editor' : `${list.length} editors`}
      </span>
    </div>
  );
}

const STATUS_LABEL = {
  connecting: { text: 'Connecting...', tone: 'text-slate-500' },
  ready: { text: 'Live', tone: 'text-emerald-600' },
  disconnected: { text: 'Reconnecting...', tone: 'text-amber-600' },
  error: { text: 'Sync unavailable', tone: 'text-rose-600' },
};

export default function ProjectNotes({ workspace, project, ready = true }) {
  const { user } = useAuth();
  const archived = project.status === 'archived';
  const canEdit = !archived && hasPermission(workspace, 'document:edit');
  const { text, setText, status, subscribers, error } = useDocument(project.id, { canEdit, ready });

  const statusInfo = STATUS_LABEL[status] ?? STATUS_LABEL.connecting;

  return (
    <section className="glass-card flex min-h-[12rem] flex-col rounded-2xl p-4 sm:min-h-[16rem] sm:p-5" aria-label="Project notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-gradient">Project notes</span>
        </h2>
        <div className="flex items-center gap-3">
          <EditorStack subscribers={subscribers} currentUserId={user?.id ?? null} />
          <span className={`text-xs font-medium ${statusInfo.tone}`}>{statusInfo.text}</span>
        </div>
      </div>

      {archived ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
          This project is archived, so notes are read-only.
        </p>
      ) : !canEdit ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
          You can read the shared notes but not edit them.
        </p>
      ) : null}

      {status === 'error' && error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        rows={6}
        placeholder={canEdit ? 'Shared scratchpad for the team...' : 'No notes yet.'}
        aria-label="Project notes editor"
        className="mt-3 min-h-[8rem] w-full flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600 sm:min-h-[12rem] sm:font-mono"
      />

      <p className="mt-2 text-xs text-slate-500">
        Autosaved as you type. Changes merge live with everyone in the room; no refresh needed.
      </p>
    </section>
  );
}
