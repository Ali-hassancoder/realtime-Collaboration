import { useState } from 'react';
import { fullTime, timeAgo } from '../../lib/format';
import { hasPermission } from '../../lib/permissions';
import { useAuth } from '../auth/useAuth';
import { useCommentEvents, useComments, useCreateComment, useDeleteComment, useUpdateComment } from './hooks';

const actionLink = 'text-xs font-medium transition-colors hover:underline';

const composerClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300';

function CommentItem({ comment, workspace, project, taskId, currentUserId, archived, onNotice }) {
  const update = useUpdateComment(workspace.id, project.id, taskId);
  const del = useDeleteComment(workspace.id, project.id, taskId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const isOwn = comment.authorId === currentUserId;
  // Mirrors comment:edit_own / delete_own / delete_any (docs/PERMISSIONS.md). UI hint only.
  const canEdit = isOwn && hasPermission(workspace, 'comment:edit_own') && !archived;
  const canDelete =
    !archived && (hasPermission(workspace, 'comment:delete_any') || (isOwn && hasPermission(workspace, 'comment:delete_own')));

  const save = async () => {
    onNotice(null);
    try {
      await update.mutateAsync({
        workspaceId: workspace.id,
        projectId: project.id,
        taskId,
        commentId: comment.id,
        version: comment.version,
        body: draft.trim(),
      });
      setEditing(false);
    } catch (err) {
      setEditing(false);
      onNotice({
        ok: false,
        text:
          err.code === 'COMMENT_VERSION_CONFLICT'
            ? 'Someone else changed this comment, so your edit was not saved. The latest version is shown; try again.'
            : err.message,
      });
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this comment?')) return;
    onNotice(null);
    try {
      await del.mutateAsync({ workspaceId: workspace.id, projectId: project.id, taskId, commentId: comment.id });
    } catch (err) {
      onNotice({ ok: false, text: err.message });
    }
  };

  return (
    <li className="animate-fade-in rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          {comment.author?.name ?? 'Unknown'}
          {isOwn && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
        </p>
        <time title={fullTime(comment.createdAt)} className="shrink-0 text-xs text-slate-400">
          {timeAgo(comment.createdAt)}
        </time>
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            aria-label="Edit comment"
            className={composerClass}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={update.isPending || !draft.trim()}
              className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              {update.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{comment.body}</p>
      )}

      {!editing && (canEdit || canDelete) && (
        <div className="mt-1.5 flex items-center gap-3">
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} className={`${actionLink} text-violet-600 hover:text-fuchsia-600`}>
              Edit
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={remove} disabled={del.isPending} className={`${actionLink} text-rose-600 hover:text-rose-700`}>
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CommentComposer({ workspace, project, taskId, archived, onNotice }) {
  const create = useCreateComment(workspace.id, project.id, taskId);
  const [body, setBody] = useState('');

  if (archived) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
        This project is archived, so comments are read-only.
      </p>
    );
  }
  if (!hasPermission(workspace, 'comment:create')) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    onNotice(null);
    try {
      await create.mutateAsync({ workspaceId: workspace.id, projectId: project.id, taskId, body: body.trim() });
      setBody('');
    } catch (err) {
      onNotice({ ok: false, text: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Write a comment..."
        aria-label="Write a comment"
        className={composerClass}
      />
      <button
        type="submit"
        disabled={create.isPending || !body.trim()}
        className="btn-gradient shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
      >
        {create.isPending ? 'Posting...' : 'Comment'}
      </button>
    </form>
  );
}

// Phase 9: the task's comment thread, rendered inside the task dialog. Live updates arrive
// through useCommentEvents while the dialog is open (docs/SOCKET_EVENTS.md).
export default function TaskComments({ workspace, project, taskId }) {
  const { user } = useAuth();
  const query = useComments(workspace.id, project.id, taskId);
  useCommentEvents(workspace.id, project.id, taskId);
  const [notice, setNotice] = useState(null);

  const archived = project.status === 'archived';
  // Infinite pages are newest-first; the thread reads chronologically
  const comments = query.data ? [...query.data.pages].reverse().flatMap((page) => page.comments) : [];

  return (
    <section className="space-y-3" aria-label="Comments">
      <h3 className="text-sm font-semibold text-slate-800">
        Comments
        {comments.length > 0 && <span className="ml-1 font-normal text-slate-400">({comments.length})</span>}
      </h3>

      {notice && (
        <p
          role="status"
          className={`animate-fade-in rounded-lg px-3 py-2 text-sm ring-1 ${
            notice.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {notice.text}
        </p>
      )}

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className={`${actionLink} text-violet-600 hover:text-fuchsia-600`}
        >
          {query.isFetchingNextPage ? 'Loading...' : 'Load older comments'}
        </button>
      )}

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading comments...</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-rose-600">
          {query.error.message}
        </p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              workspace={workspace}
              project={project}
              taskId={taskId}
              currentUserId={user?.id ?? null}
              archived={archived}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}

      <CommentComposer workspace={workspace} project={project} taskId={taskId} archived={archived} onNotice={setNotice} />
    </section>
  );
}
