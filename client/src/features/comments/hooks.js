import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socket } from '../../services/socket';
import { useAuth } from '../auth/useAuth';
import * as api from '../../services/comments';

// Nested under the Phase 8 task key, so task/project invalidation also refreshes the thread
const commentsKey = (workspaceId, projectId, taskId) => [
  'workspaces',
  workspaceId,
  'projects',
  projectId,
  'tasks',
  taskId,
  'comments',
];

// Infinite pages are newest-first; each page's comments are chronological (oldest first)
const appendNewest = (data, comment) => ({
  ...data,
  pages: data.pages.map((page, i) =>
    i === 0
      ? page.comments.some((c) => c.id === comment.id)
        ? page
        : { ...page, comments: [...page.comments, comment] }
      : page
  ),
});

const replaceInPages = (data, comment) => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, comments: page.comments.map((c) => (c.id === comment.id ? comment : c)) })),
});

const removeFromPages = (data, commentId) => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, comments: page.comments.filter((c) => c.id !== commentId) })),
});

export const useComments = (workspaceId, projectId, taskId) =>
  useInfiniteQuery({
    queryKey: commentsKey(workspaceId, projectId, taskId),
    queryFn: ({ pageParam }) => api.listComments(workspaceId, projectId, taskId, { before: pageParam }),
    initialPageParam: undefined,
    // Continue from the oldest comment loaded so far
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.comments[0].id : undefined),
  });

export function useCreateComment(workspaceId, projectId, taskId) {
  const queryClient = useQueryClient();
  const key = commentsKey(workspaceId, projectId, taskId);
  return useMutation({
    mutationFn: api.createComment,
    onSuccess: (comment) => queryClient.setQueryData(key, (data) => (data ? appendNewest(data, comment) : data)),
  });
}

export function useUpdateComment(workspaceId, projectId, taskId) {
  const queryClient = useQueryClient();
  const key = commentsKey(workspaceId, projectId, taskId);
  return useMutation({
    mutationFn: api.updateComment,
    onSuccess: (comment) => queryClient.setQueryData(key, (data) => (data ? replaceInPages(data, comment) : data)),
    // A version conflict means the cache is stale, so fetch the authoritative thread
    onError: (err) => {
      if (err.code === 'COMMENT_VERSION_CONFLICT') queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteComment(workspaceId, projectId, taskId) {
  const queryClient = useQueryClient();
  const key = commentsKey(workspaceId, projectId, taskId);
  return useMutation({
    mutationFn: api.deleteComment,
    onSuccess: (_data, { commentId }) => queryClient.setQueryData(key, (data) => (data ? removeFromPages(data, commentId) : data)),
  });
}

// Applies Phase 9 comment events (docs/SOCKET_EVENTS.md) while this task's dialog is open.
// The acting client ignores its own events: its REST response is already applied.
export function useCommentEvents(workspaceId, projectId, taskId) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    const key = commentsKey(workspaceId, projectId, taskId);
    const isMine = (actorId) => actorId === userId;

    const onCreated = ({ comment, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? appendNewest(data, comment) : data));
    };
    const onUpdated = ({ comment, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? replaceInPages(data, comment) : data));
    };
    const onRemoved = ({ commentId, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? removeFromPages(data, commentId) : data));
    };

    socket.on('comment.created', onCreated);
    socket.on('comment.updated', onUpdated);
    socket.on('comment.deleted', onRemoved);
    return () => {
      socket.off('comment.created', onCreated);
      socket.off('comment.updated', onUpdated);
      socket.off('comment.deleted', onRemoved);
    };
  }, [workspaceId, projectId, taskId, userId, queryClient]);
}
