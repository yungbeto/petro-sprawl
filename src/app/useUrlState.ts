import { useCallback, useEffect, useState } from 'react';
import {
  parseUrlState,
  sameSelection,
  serializeUrlState,
  type Camera,
  type Selection,
} from './urlState';

// Marks history entries this app pushed, so "back" only steps within the app.
const PUSHED = 'etPushed';

function urlFor(search: string): string {
  return `${window.location.pathname}${search}${window.location.hash}`;
}

function currentState() {
  return parseUrlState(window.location.search);
}

export function useUrlState() {
  const [selection, setSelection] = useState<Selection | null>(() => currentState().selection);

  useEffect(() => {
    const onPopState = () => setSelection(currentState().selection);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const select = useCallback((next: Selection | null) => {
    const state = currentState();
    if (sameSelection(state.selection, next)) return;
    const search = serializeUrlState({ ...state, selection: next }, window.location.search);
    window.history.pushState({ [PUSHED]: true }, '', urlFor(search));
    setSelection(next);
  }, []);

  /** Returns to the previous panel state. Never leaves the app. */
  const back = useCallback(() => {
    const pushed = (window.history.state as Record<string, unknown> | null)?.[PUSHED] === true;
    if (pushed) {
      window.history.back();
      return;
    }
    const state = currentState();
    if (!state.selection) return;
    const search = serializeUrlState({ ...state, selection: null }, window.location.search);
    window.history.replaceState(null, '', urlFor(search));
    setSelection(null);
  }, []);

  /** Camera changes replace the current entry, so panning doesn't flood history. */
  const setCamera = useCallback((camera: Camera) => {
    const state = currentState();
    const search = serializeUrlState({ ...state, camera }, window.location.search);
    window.history.replaceState(window.history.state, '', urlFor(search));
  }, []);

  return { selection, select, back, setCamera, initialCamera: currentState().camera };
}
