import { useEffect, useRef } from 'react';
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { socket } from '../../services/socket';
import { useAuth } from '../auth/useAuth';
import * as api from '../../services/tasks';
import { moveInBoard, removeFromBoard, upsertInBoard } from './boardUtils';

// Nested under the Phase 5 project keys, so project-level invalidation also refreshes the board
const projectKey = (workspaceId, projectId) => ['workspaces', workspaceId, 'projects', projectId];
const boardKey = (workspaceId, projectId) => [...projectKey(workspaceId, projectId), 'board'];
const taskKey = (workspaceId, projectId, taskId) => [...projectKey(workspaceId, projectId), 'tasks', taskId];
const moveKey = (projectId) => ['tasks', 'move', projectId];

export const useBoard = (workspaceId, projectId) =>
  useQuery({ queryKey: boardKey(workspaceId, projectId), queryFn: () => api.getBoard(workspaceId, projectId) });

export const useTask = (workspaceId, projectId, taskId) =>
  useQuery({
    queryKey: taskKey(workspaceId, projectId, taskId),
    queryFn: () => api.getTask(workspaceId, projectId, taskId),
    retry: false,
  });

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: (_task, { workspaceId, projectId }) =>
      queryClient.invalidateQueries({ queryKey: boardKey(workspaceId, projectId) }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateTask,
    // Settled (not just success): after a version conflict we want the latest copy too
    onSettled: (_data, _error, { workspaceId, projectId, taskId }) => {
      queryClient.invalidateQueries({ queryKey: boardKey(workspaceId, projectId) });
      queryClient.invalidateQueries({ queryKey: taskKey(workspaceId, projectId, taskId) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTask,
    // Only the board: refetching the deleted task itself would 404
    onSuccess: (_data, { workspaceId, projectId }) =>
      queryClient.invalidateQueries({ queryKey: boardKey(workspaceId, projectId) }),
  });
}

// Optimistic: the card moves immediately; if the server rejects it, the board is rolled back
export function useMoveTask(workspaceId, projectId) {
  const queryClient = useQueryClient();
  const key = boardKey(workspaceId, projectId);

  return useMutation({
    mutationKey: moveKey(projectId),
    mutationFn: ({ taskId, version, status, prevId, nextId }) =>
      api.moveTask({ workspaceId, projectId, taskId, version, status, prevId, nextId }),
    onMutate: async ({ taskId, status, index }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (board) => (board ? moveInBoard(board, taskId, status, index) : board));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: (_data, _error, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKey(workspaceId, projectId, taskId) });
      // With several moves in flight, only the last one to settle refetches (avoids flicker)
      if (queryClient.isMutating({ mutationKey: moveKey(projectId) }) === 1) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// IDs of tasks whose move is still being saved; the board keeps those cards from being dragged again
export const usePendingMoveIds = (projectId) =>
  useMutationState({
    filters: { mutationKey: moveKey(projectId), status: 'pending' },
    select: (mutation) => mutation.state.variables?.taskId,
  });

// Applies Phase 8 task events (task.created / task.updated / task.deleted, docs/SOCKET_EVENTS.md)
// to the cached board while this project's board is open. The acting client ignores its own
// events: its REST response (or optimistic move) is already applied.
export function useTaskEvents(workspaceId, projectId, { onDeleted } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

  useEffect(() => {
    const board = boardKey(workspaceId, projectId);
    const isMine = (actorId) => actorId === userId;

    const onCreated = ({ task, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(board, (current) => (current ? upsertInBoard(current, task) : current));
    };
    const onUpdated = ({ task, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(board, (current) => (current ? upsertInBoard(current, task) : current));
      // A dialog already open on this task follows the new version (TaskForm resets on key={version})
      const single = taskKey(workspaceId, projectId, task.id);
      if (queryClient.getQueryData(single) !== undefined) queryClient.setQueryData(single, task);
    };
    const onRemoved = ({ taskId, actorId }) => {
      if (isMine(actorId)) return;
      queryClient.setQueryData(board, (current) => (current ? removeFromBoard(current, taskId) : current));
      onDeletedRef.current?.(taskId);
    };

    socket.on('task.created', onCreated);
    socket.on('task.updated', onUpdated);
    socket.on('task.deleted', onRemoved);
    return () => {
      socket.off('task.created', onCreated);
      socket.off('task.updated', onUpdated);
      socket.off('task.deleted', onRemoved);
    };
  }, [workspaceId, projectId, userId, queryClient]);
}