import { useCallback, useEffect, useState } from 'react';
import {
  parseUrlState,
  sameSelection,
  serializeUrlState,
  type Camera,
  type Selection,
} from './urlState';
import type { FilterId } from '../lib/filters';

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
  const [filter, setFilterState] = useState<FilterId | null>(() => currentState().filter ?? null);

  useEffect(() => {
    const onPopState = () => {
      const state = currentState();
      setSelection(state.selection);
      setFilterState(state.filter ?? null);
    };
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

  /**
   * Sets or clears the quick filter, closing any open detail so the panel shows the matches.
   * A new history entry, so Back returns to where you were.
   */
  const setFilter = useCallback((next: FilterId | null) => {
    const state = currentState();
    if ((state.filter ?? null) === next && !state.selection) return;
    const search = serializeUrlState({ ...state, filter: next, selection: null }, window.location.search);
    window.history.pushState({ [PUSHED]: true }, '', urlFor(search));
    setFilterState(next);
    setSelection(null);
  }, []);

  /** Returns to the previous panel state. Never leaves the app. */
  const back = useCallback(() => {
    const pushed = (window.history.state as Record<string, unknown> | null)?.[PUSHED] === true;
    if (pushed) {
      window.history.back();
      return;
    }
    // Opened from a link: step up one level, selection first, then the filter.
    const state = currentState();
    if (!state.selection && !state.filter) return;
    const next = state.selection ? { ...state, selection: null } : { ...state, filter: null };
    window.history.replaceState(null, '', urlFor(serializeUrlState(next, window.location.search)));
    setSelection(next.selection);
    setFilterState(next.filter ?? null);
  }, []);

  /** Camera changes replace the current entry, so panning doesn't flood history. */
  const setCamera = useCallback((camera: Camera) => {
    const state = currentState();
    const search = serializeUrlState({ ...state, camera }, window.location.search);
    window.history.replaceState(window.history.state, '', urlFor(search));
  }, []);

  return { selection, select, filter, setFilter, back, setCamera, initialCamera: currentState().camera };
}
