import { useEffect, useRef, useState } from 'react';
import { fullTime, timeAgo } from '../../lib/format';
import { hasPermission } from '../../lib/permissions';
import { useAuth } from '../auth/useAuth';
import { useCreateMessage, useDeleteMessage, useMessageEvents, useMessages, useUpdateMessage } from '../messages/hooks';

const actionLink = 'text-xs font-medium transition-colors hover:underline';

function MessageBubble({ message, workspace, project, currentUserId, archived, onNotice }) {
  const update = useUpdateMessage(workspace.id, project.id);
  const del = useDeleteMessage(workspace.id, project.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const isOwn = message.authorId === currentUserId;
  // Mirrors message:edit_own / delete_own / delete_any (docs/PERMISSIONS.md). UI hint only.
  const canEdit = isOwn && hasPermission(workspace, 'message:edit_own') && !archived;
  const canDelete =
    !archived && (hasPermission(workspace, 'message:delete_any') || (isOwn && hasPermission(workspace, 'message:delete_own')));

  const save = async () => {
    onNotice(null);
    try {
      await update.mutateAsync({
        workspaceId: workspace.id,
        projectId: project.id,
        messageId: message.id,
        version: message.version,
        body: draft.trim(),
      });
      setEditing(false);
    } catch (err) {
      setEditing(false);
      onNotice({
        ok: false,
        text:
          err.code === 'MESSAGE_VERSION_CONFLICT'
            ? 'Someone else changed this message, so your edit was not saved. The latest version is shown; try again.'
            : err.message,
      });
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this message?')) return;
    onNotice(null);
    try {
      await del.mutateAsync({ workspaceId: workspace.id, projectId: project.id, messageId: message.id });
    } catch (err) {
      onNotice({ ok: false, text: err.message });
    }
  };

  const bubble = isOwn
    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
    : 'bg-slate-100 text-slate-800 ring-1 ring-slate-200';
  const meta = isOwn ? 'text-white/70' : 'text-slate-400';

  return (
    <li className={`flex animate-fade-in ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${bubble}`}>
        {!isOwn && <p className="text-xs font-semibold text-violet-700">{message.author?.name ?? 'Unknown'}</p>}

        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              aria-label="Edit message"
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={update.isPending || !draft.trim()}
                className="btn-gradient rounded-lg px-3 py-1 text-xs font-semibold"
              >
                {update.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        )}

        <div className={`mt-1 flex items-center gap-2 text-[10px] ${isOwn ? 'justify-end' : 'justify-start'} ${meta}`}>
          <span title={fullTime(message.createdAt)}>{timeAgo(message.createdAt)}</span>
          {!editing && canEdit && (
            <button type="button" onClick={() => setEditing(true)} className={`${actionLink} text-inherit`}>
              Edit
            </button>
          )}
          {!editing && canDelete && (
            <button type="button" onClick={remove} disabled={del.isPending} className={`${actionLink} text-inherit`}>
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ChatComposer({ workspace, project, archived, onNotice }) {
  const create = useCreateMessage(workspace.id, project.id);
  const [body, setBody] = useState('');

  if (archived) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
        This project is archived, so chat is read-only.
      </p>
    );
  }
  if (!hasPermission(workspace, 'message:create')) return null;

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    onNotice(null);
    try {
      await create.mutateAsync({ workspaceId: workspace.id, projectId: project.id, body: text });
      setBody('');
    } catch (err) {
      onNotice({ ok: false, text: err.message });
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 border-t border-slate-200 pt-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter writes a new line
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder="Message the project team..."
        aria-label="Chat message"
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300"
      />
      <button
        type="submit"
        disabled={create.isPending || !body.trim()}
        className="btn-gradient shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
      >
        {create.isPending ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}

// Phase 10: the project chat. Live updates arrive through useMessageEvents while the project
// page is open (docs/SOCKET_EVENTS.md).
export default function ProjectChat({ workspace, project }) {
  const { user } = useAuth();
  const query = useMessages(workspace.id, project.id);
  useMessageEvents(workspace.id, project.id);
  const [notice, setNotice] = useState(null);
  const listRef = useRef(null);

  const archived = project.status === 'archived';
  // Infinite pages are newest-first; the chat reads chronologically
  const messages = query.data ? [...query.data.pages].reverse().flatMap((page) => page.messages) : [];
  const newestId = messages[messages.length - 1]?.id;

  // Follow the conversation. Keyed on the newest id (not the count), so loading older
  // pages does not yank the reader back to the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId]);

  return (
    <section className="glass-card flex min-h-[24rem] flex-col rounded-2xl p-5" aria-label="Project chat">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="text-gradient">Project chat</span>
        </h2>
        {query.hasNextPage && (
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className={`${actionLink} text-violet-600 hover:text-fuchsia-600`}
          >
            {query.isFetchingNextPage ? 'Loading...' : 'Load older'}
          </button>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-3 animate-fade-in rounded-lg px-3 py-2 text-sm ring-1 ${
            notice.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div ref={listRef} className="mt-3 max-h-80 flex-1 space-y-3 overflow-y-auto pr-1">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">Loading chat...</p>
        ) : query.isError ? (
          <p role="alert" className="text-sm text-rose-600">
            {query.error.message}
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet. Say hello to the team.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                workspace={workspace}
                project={project}
                currentUserId={user?.id ?? null}
                archived={archived}
                onNotice={setNotice}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <ChatComposer workspace={workspace} project={project} archived={archived} onNotice={setNotice} />
      </div>
    </section>
  );
}
