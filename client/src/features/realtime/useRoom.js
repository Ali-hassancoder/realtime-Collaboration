import { useEffect, useState } from 'react';
import { joinRoom, leaveRoom, socket } from '../../services/socket';

// Joins a server-authorized room while the component is mounted, and re-joins after a reconnect
// (a new connection starts with no rooms) or after the server reports an access change.
// room: { type: 'workspace', workspaceId } | { type: 'project', workspaceId, projectId } | null
export function useRoom(room) {
  const key = room ? JSON.stringify(room) : null; // stable dependency
  const [state, setState] = useState({ status: 'connecting', error: null });

  useEffect(() => {
    if (!key) return undefined;
    const target = JSON.parse(key);
    let cancelled = false;
    const update = (next) => {
      if (!cancelled) setState(next);
    };

    const join = async () => {
      if (!socket.connected) {
        update({ status: 'connecting', error: null });
        return;
      }
      try {
        await joinRoom(target);
        update({ status: 'joined', error: null });
      } catch (err) {
        update({ status: 'error', error: err.message });
      }
    };
    const onDisconnect = () => update({ status: 'connecting', error: null });

    socket.on('connect', join);
    socket.on('access.changed', join);
    socket.on('disconnect', onDisconnect);
    join();

    return () => {
      cancelled = true;
      socket.off('connect', join);
      socket.off('access.changed', join);
      socket.off('disconnect', onDisconnect);
      if (socket.connected) leaveRoom(target).catch(() => {});
    };
  }, [key]);

  return state;
}