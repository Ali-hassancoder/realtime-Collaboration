import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { SocketYjsProvider } from './socketYjsProvider';

// Shared Yjs type name. This must match `document.service.js` (`ydoc.getText('content')`) so the
// bytes the server persists and the bytes the client hydrates refer to the same slot.
export const NOTES_KEY = 'content';

// The smallest useful collaborative editing hook: bind a plain textarea to a project's shared
// Y.Text, expose live subscriber presence, and refuse local edits when `canEdit` is false so the
// read-only case (a guest viewing the project's notes) needs no extra wiring above the caller.
//
// Yjs keeps the authoritative state. React state mirrors it (`text`) so a rerender paints the
// textarea. Every change flows one of two ways:
//   - local edit  -> diff against ytext -> transaction(origin='local') -> provider emits
//   - remote edit -> provider applies (origin='remote') -> ytext.observe fires -> setText
export function useDocument(projectId, { canEdit = true, ready = true } = {}) {
  const [snapshot, setSnapshot] = useState({ text: '', status: 'connecting', subscribers: [], error: null });
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  useEffect(() => {
    if (!projectId || !ready) return undefined;
    const ydoc = new Y.Doc();
    const provider = new SocketYjsProvider(ydoc, projectId);
    ydocRef.current = ydoc;
    providerRef.current = provider;

    const ytext = ydoc.getText(NOTES_KEY);
    const sync = () => {
      setSnapshot({
        text: ytext.toString(),
        status: provider.status,
        subscribers: provider.subscribers,
        error: provider.error,
      });
    };
    ytext.observe(sync);
    const offProvider = provider.subscribe(sync);
    provider.start();

    return () => {
      offProvider();
      ytext.unobserve(sync);
      provider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      setSnapshot({ text: '', status: 'connecting', subscribers: [], error: null });
    };
  }, [projectId, ready]);

  const replaceText = useCallback((newValue) => {
    if (!canEdit) return;
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const ytext = ydoc.getText(NOTES_KEY);
    const current = ytext.toString();
    if (newValue === current) return;
    // Trim the common prefix and suffix, then delete/insert only the changed middle. This keeps
    // the Yjs op small so it merges cleanly with concurrent remote edits.
    ytext.transact(() => {
      let start = 0;
      const minLen = Math.min(current.length, newValue.length);
      while (start < minLen && current[start] === newValue[start]) start += 1;
      let endOld = current.length;
      let endNew = newValue.length;
      while (endOld > start && endNew > start && current[endOld - 1] === newValue[endNew - 1]) {
        endOld -= 1;
        endNew -= 1;
      }
      const deleteLen = endOld - start;
      if (deleteLen > 0) ytext.delete(start, deleteLen);
      const inserted = newValue.slice(start, endNew);
      if (inserted.length > 0) ytext.insert(start, inserted);
    }, 'local');
    // Optimistic React mirror so the textarea does not flicker between keypress and observe.
    setSnapshot((s) => (s.text === newValue ? s : { ...s, text: newValue }));
  }, [canEdit]);

  return {
    ...snapshot,
    canEdit,
    setText: replaceText,
  };
}
