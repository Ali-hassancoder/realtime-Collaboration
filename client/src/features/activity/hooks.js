import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { socket } from '../../services/socket';
import * as api from '../../services/activity';

// Nested under the Phase 5 project key, so project-level invalidation also refreshes the feed
const activityKey = (workspaceId, projectId) => ['workspaces', workspaceId, 'projects', projectId, 'activity'];

// Pages are newest-first; new entries prepend to the first page
const prependNewest = (data, activity) => ({
  ...data,
  pages: data.pages.map((page, i) =>
    i === 0
      ? page.activities.some((a) => a.id === activity.id)
        ? page
        : { ...page, activities: [activity, ...page.activities] }
      : page
  ),
});

export const useActivity = (workspaceId, projectId) =>
  useInfiniteQuery({
    queryKey: activityKey(workspaceId, projectId),
    queryFn: ({ pageParam }) => api.listActivity(workspaceId, projectId, { before: pageParam }),
    initialPageParam: undefined,
    // Continue from the oldest entry loaded so far
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.activities[lastPage.activities.length - 1].id : undefined),
  });

// Applies Phase 9 activity events (docs/SOCKET_EVENTS.md). Unlike task/comment/message events
// there is no actor filter here: the feed shows your own actions too, so entries are deduped by id.
export function useActivityEvents(workspaceId, projectId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const key = activityKey(workspaceId, projectId);
    const onCreated = ({ activity }) => queryClient.setQueryData(key, (data) => (data ? prependNewest(data, activity) : data));

    socket.on('activity.created', onCreated);
    return () => socket.off('activity.created', onCreated);
  }, [workspaceId, projectId, queryClient]);
}
