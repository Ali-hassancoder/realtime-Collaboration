import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socket } from '../../services/socket';
import { useAuth } from '../auth/useAuth';
import * as api from '../../services/messages';

// Nested under the Phase 5 project key, so project-level invalidation also refreshes chat
const messagesKey = (workspaceId, projectId) => ['workspaces', workspaceId, 'projects', projectId, 'messages'];

// Infinite pages are newest-first; each page's messages are chronological (oldest first)
const appendNewest = (data, message) => ({
  ...data,
  pages: data.pages.map((page, i) =>
    i === 0
      ? page.messages.some((m) => m.id === message.id)
        ? page
        : { ...page, messages: [...page.messages, message] }
      : page
  ),
});

const replaceInPages = (data, message) => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, messages: page.messages.map((m) => (m.id === message.id ? message : m)) })),
});

const removeFromPages = (data, messageId) => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, messages: page.messages.filter((m) => m.id !== messageId) })),
});

export const useMessages = (workspaceId, projectId) =>
  useInfiniteQuery({
    queryKey: messagesKey(workspaceId, projectId),
    queryFn: ({ pageParam }) => api.listMessages(workspaceId, projectId, { before: pageParam }),
    initialPageParam: undefined,
    // Continue from the oldest message loaded so far
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages[0].id : undefined),
  });

export function useCreateMessage(workspaceId, projectId) {
  const queryClient = useQueryClient();
  const key = messagesKey(workspaceId, projectId);
  return useMutation({
    mutationFn: api.createMessage,
    onSuccess: (message) => queryClient.setQueryData(key, (data) => (data ? appendNewest(data, message) : data)),
  });
}

export function useUpdateMessage(workspaceId, projectId) {
  const queryClient = useQueryClient();
  const key = messagesKey(workspaceId, projectId);
  return useMutation({
    mutationFn: api.updateMessage,
    onSuccess: (message) => queryClient.setQueryData(key, (data) => (data ? replaceInPages(data, message) : data)),
    // A version conflict means the cache is stale, so fetch the authoritative chat
    onError: (err) => {
      if (err.code === 'MESSAGE_VERSION_CONFLICT') queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteMessage(workspaceId, projectId) {
  const queryClient = useQueryClient();
  const key = messagesKey(workspaceId, projectId);
  return useMutation({
    mutationFn: api.deleteMessage,
    onSuccess: (_data, { messageId }) => queryClient.setQueryData(key, (data) => (data ? removeFromPages(data, messageId) : data)),
  });
}

// Applies Phase 10 chat events (docs/SOCKET_EVENTS.md) while this project's chat is open.
// The acting client ignores its own events: its REST response is already applied.
export function useMessageEvents(workspaceId, projectId) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    const key = messagesKey(workspaceId, projectId);
    const isMine = (actorId) => actorId === userId;

    const onCreated = ({ message, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? appendNewest(data, message) : data));
    };
    const onUpdated = ({ message, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? replaceInPages(data, message) : data));
    };
    const onRemoved = ({ messageId, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(key, (data) => (data ? removeFromPages(data, messageId) : data));
    };

    socket.on('message.created', onCreated);
    socket.on('message.updated', onUpdated);
    socket.on('message.deleted', onRemoved);
    return () => {
      socket.off('message.created', onCreated);
      socket.off('message.updated', onUpdated);
      socket.off('message.deleted', onRemoved);
    };
  }, [workspaceId, projectId, userId, queryClient]);
}
