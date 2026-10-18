import { useEffect, useRef, useState } from 'react';
import { sendTyping, socket } from '../../services/socket';

// Phase 12 presence and typing (docs/SOCKET_EVENTS.md). Both are transient: they live only in
// component state, never in the query cache, because a roster or a "typing" blip has no history to
// refetch. The server sends the full roster on every change, so the client just replaces it.

// Who is viewing this project right now. The roster arrives from presence.updated, which the server
// emits to the room (including us) whenever someone joins or leaves via useRoom.
export function usePresence(projectId) {
  const [online, setOnline] = useState([]);

  useEffect(() => {
    setOnline([]); // a new project starts empty until the first roster arrives
    const onUpdated = (payload) => {
      if (payload.projectId === projectId) setOnline(payload.online ?? []);
    };
    socket.on('presence.updated', onUpdated);
    return () => socket.off('presence.updated', onUpdated);
  }, [projectId]);

  return online;
}

// A typing blip expires on its own, so a stale "stopped" that never arrives (tab closed) still
// clears. typing.started refreshes the timer, so an active typist stays shown.
const TYPING_TTL_MS = 5000;

export function useTyping(projectId, currentUserId) {
  const [typists, setTypists] = useState([]); // [{ id, name }]
  const timers = useRef(new Map()); // userId -> timeout handle

  useEffect(() => {
    const map = timers.current;
    const drop = (id) => {
      const handle = map.get(id);
      if (handle) {
        clearTimeout(handle);
        map.delete(id);
      }
      setTypists((prev) => prev.filter((t) => t.id !== id));
    };

    const onStart = ({ projectId: pid, user }) => {
      if (pid !== projectId || user.id === currentUserId) return;
      setTypists((prev) => (prev.some((t) => t.id === user.id) ? prev : [...prev, user]));
      const handle = map.get(user.id);
      if (handle) clearTimeout(handle);
      map.set(
        user.id,
        setTimeout(() => {
          map.delete(user.id);
          setTypists((prev) => prev.filter((t) => t.id !== user.id));
        }, TYPING_TTL_MS)
      );
    };
    const onStop = ({ projectId: pid, userId }) => {
      if (pid !== projectId) return;
      drop(userId);
    };

    socket.on('typing.started', onStart);
    socket.on('typing.stopped', onStop);
    return () => {
      socket.off('typing.started', onStart);
      socket.off('typing.stopped', onStop);
      map.forEach(clearTimeout);
      map.clear();
    };
  }, [projectId, currentUserId]);

  return typists;
}

// Drives the outgoing side: notify() on each keystroke (self-throttled so we do not flood the
// socket; the server throttles again), stop() when the field is cleared or the message is sent.
const ANNOUNCE_MIN_MS = 2000;

export function useTypingSender(projectId) {
  const started = useRef(false);
  const lastSent = useRef(0);

  useEffect(
    () => () => {
      // Leaving the project should not leave us "typing" for everyone else
      if (started.current) sendTyping(projectId, false);
    },
    [projectId]
  );

  return {
    notify() {
      const now = Date.now();
      if (!started.current || now - lastSent.current >= ANNOUNCE_MIN_MS) {
        started.current = true;
        lastSent.current = now;
        sendTyping(projectId, true);
      }
    },
    stop() {
      if (!started.current) return;
      started.current = false;
      sendTyping(projectId, false);
    },
  };
}
