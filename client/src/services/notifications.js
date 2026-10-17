import { apiRequest } from './api';

const base = '/api/notifications';

// Returns { notifications, hasMore, unreadCount }; notifications are newest first
export const listNotifications = async ({ before, unread } = {}) => {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (unread) params.set('unread', 'true');
  const qs = params.toString();
  return (await apiRequest(`${base}${qs ? `?${qs}` : ''}`)).data;
};

export const markNotificationRead = async (notificationId) =>
  (await apiRequest(`${base}/${notificationId}/read`, { method: 'PATCH' })).data.notification;

export const markAllNotificationsRead = async () => (await apiRequest(`${base}/read-all`, { method: 'POST' })).data;
