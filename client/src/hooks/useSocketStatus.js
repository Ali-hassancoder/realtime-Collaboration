import { useEffect, useState } from 'react';
import { connectSocket, disconnectSocket, socket } from '../services/socket';

export function useSocketStatus() {
  const [status, setStatus] = useState({ connected: socket.connected, id: socket.id ?? null, error: null });

  useEffect(() => {
    const onConnect = () => setStatus({ connected: true, id: socket.id, error: null });
    const onDisconnect = () => setStatus((s) => ({ ...s, connected: false, id: null }));
    const onError = (err) => setStatus((s) => ({ ...s, connected: false, error: err.message }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  return {
    ...status,
    // Diagnostic only. While logged in the app connects on its own.
    toggle: () => (socket.connected ? disconnectSocket() : connectSocket()),
  };
}