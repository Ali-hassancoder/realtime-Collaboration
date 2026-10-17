import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_KEY } from '../auth/useAuth';
import { connectSocket, disconnectSocket, socket } from '../../services/socket';

// Keeps one socket connected while a user is logged in
export function useSocketLifecycle(user) {
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return undefined;

    // The server says our access changed (removed, role changed, project deleted...): refetch
    const onAccessChanged = () => queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    socket.on('access.changed', onAccessChanged);
    // The session could not be refreshed: re-check who we are, which sends us to the login page
    connectSocket({ onAuthLost: () => queryClient.invalidateQueries({ queryKey: AUTH_KEY }) });

    return () => {
      socket.off('access.changed', onAccessChanged);
      disconnectSocket();
    };
  }, [userId, queryClient]);
}