import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socket } from '../../services/socket';
import * as api from '../../services/notifications';

// The inbox is personal, so the key carries no workspace; logout clears the cache
export const notificationsKey = ['notifications'];

// A live notification is always new and unread: page 0 learns it, every page's count bumps
const prependNewest = (data, notification) => {
  if (data.pages[0]?.notifications.some((n) => n.id === notification.id)) return data;
  return {
    ...data,
    pages: data.pages.map((page, i) => ({
      ...page,
      unreadCount: page.unreadCount + 1,
      notifications: i === 0 ? [notification, ...page.notifications] : page.notifications,
    })),
  };
};

// Replaces one item and only lowers the count when it was actually unread
const applyRead = (data, notification) => {
  const previous = data.pages.flatMap((page) => page.notifications).find((n) => n.id === notification.id);
  const wasUnread = previous ? !previous.readAt : false;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      unreadCount: Math.max(0, page.unreadCount - (wasUnread ? 1 : 0)),
      notifications: page.notifications.map((n) => (n.id === notification.id ? notification : n)),
    })),
  };
};

export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: notificationsKey,
    queryFn: ({ pageParam }) => api.listNotifications({ before: pageParam }),
    initialPageParam: undefined,
    // Continue from the oldest notification loaded so far
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.notifications.at(-1).id : undefined),
  });

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: (notification) =>
      queryClient.setQueryData(notificationsKey, (data) => (data ? applyRead(data, notification) : data)),
    // A failure means the cache may disagree with the server: fetch the inbox again
    onError: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () =>
      queryClient.setQueryData(notificationsKey, (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            unreadCount: 0,
            notifications: page.notifications.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
          })),
        }
      ),
    onError: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

// notification.created is delivered only to the recipient's user room, so every event
// that arrives belongs to this user: no actor filter here (docs/SOCKET_EVENTS.md)
export function useNotificationEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onCreated = ({ notification }) =>
      queryClient.setQueryData(notificationsKey, (data) => (data ? prependNewest(data, notification) : data));
    socket.on('notification.created', onCreated);
    return () => socket.off('notification.created', onCreated);
  }, [queryClient]);
}
