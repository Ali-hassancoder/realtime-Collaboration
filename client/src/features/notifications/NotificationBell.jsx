import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../lib/format';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationEvents,
  useNotifications,
} from './hooks';

// Renders the sentence after the actor avatar; meta carries the display names
function describe(notification) {
  const actor = notification.actor?.name ?? 'Someone';
  const meta = notification.meta ?? {};
  switch (notification.type) {
    case 'task.assigned':
      return (
        <>
          <strong className="font-semibold">{actor}</strong> assigned you{' '}
          <strong className="font-semibold">{meta.taskTitle}</strong>
        </>
      );
    case 'comment.created':
      return (
        <>
          <strong className="font-semibold">{actor}</strong> commented on{' '}
          <strong className="font-semibold">{meta.taskTitle}</strong>
        </>
      );
    case 'project.member_added':
      return (
        <>
          <strong className="font-semibold">{actor}</strong> added you to{' '}
          <strong className="font-semibold">{meta.projectName}</strong>
        </>
      );
    case 'invite.accepted':
      return (
        <>
          <strong className="font-semibold">{actor}</strong> accepted your invite to{' '}
          <strong className="font-semibold">{meta.workspaceName}</strong>
        </>
      );
    default:
      return (
        <>
          <strong className="font-semibold">{actor}</strong> sent a notification
        </>
      );
  }
}

export default function NotificationBell() {
  useNotificationEvents();
  const query = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const notifications = query.data ? query.data.pages.flatMap((page) => page.notifications) : [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Opening marks the item read and jumps to the project (or straight to the task)
  const openNotification = (notification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    setOpen(false);
    if (!notification.projectId) {
      navigate(`/workspaces/${notification.workspaceId}`);
      return;
    }
    const task = notification.taskId ? `?task=${notification.taskId}` : '';
    navigate(`/workspaces/${notification.workspaceId}/projects/${notification.projectId}${task}`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className={`relative rounded-full p-2 transition-colors ${
          open ? 'bg-violet-100 text-violet-700' : 'text-slate-600 hover:bg-white/80 hover:text-violet-700'
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-1 text-[10px] font-bold text-white shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Clicking anywhere outside the panel closes it */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="animate-fade-in absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-xl shadow-violet-500/10 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="text-xs font-medium text-violet-600 transition-colors hover:text-fuchsia-600 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {query.isLoading ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Loading...</p>
              ) : query.isError ? (
                <p className="px-4 py-6 text-center text-sm text-rose-600">{query.error.message}</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
              ) : (
                <ul>
                  {notifications.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className={`flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-violet-50 ${
                          notification.readAt ? '' : 'bg-violet-50/60'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-xs font-bold text-white"
                        >
                          {(notification.actor?.name ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-slate-700">{describe(notification)}</span>
                          {notification.meta?.excerpt && (
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              &ldquo;{notification.meta.excerpt}&rdquo;
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-slate-400">{timeAgo(notification.createdAt)}</span>
                        </span>
                        {!notification.readAt && (
                          <span
                            aria-label="Unread"
                            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.hasNextPage && (
                <button
                  type="button"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  className="w-full px-4 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-50 disabled:opacity-50"
                >
                  {query.isFetchingNextPage ? 'Loading...' : 'Load older'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
