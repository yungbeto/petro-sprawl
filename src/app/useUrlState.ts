import { useCallback, useEffect, useState } from 'react';
import {
  parseUrlState,
  sameSelection,
  serializeUrlState,
  type Camera,
  type Selection,
} from './urlState';
import type { FilterId } from '../lib/filters';
import type { ViewId } from '../lib/views';
import { DEFAULT_REGION_FUEL, type RegionFuel } from '../lib/config';

// Marks history entries this app pushed, so "back" only steps within the app.
const PUSHED = 'etPushed';
// Each pushed entry also records the panel state it was pushed from, so the panel can name where Back goes.
const FROM = 'etFrom';

/** The panel state an entry was opened from: what Back returns to. */
export interface PanelStep {
  view: ViewId | null;
  selection: Selection | null;
  filter: FilterId | null;
}

function stepOf(state: ReturnType<typeof currentState>): PanelStep {
  return { view: state.view ?? null, selection: state.selection, filter: state.filter ?? null };
}

/** Pushes a new entry, remembering the current panel state as where it came from. */
function push(search: string) {
  window.history.pushState({ [PUSHED]: true, [FROM]: stepOf(currentState()) }, '', urlFor(search));
}

function readFrom(): PanelStep | null {
  const state = window.history.state as Record<string, unknown> | null;
  return (state?.[FROM] as PanelStep | undefined) ?? null;
}

function urlFor(search: string): string {
  return `${window.location.pathname}${search}${window.location.hash}`;
}

function currentState() {
  return parseUrlState(window.location.search);
}

export function useUrlState() {
  const [view, setViewState] = useState<ViewId | null>(() => currentState().view ?? null);
  const [selection, setSelection] = useState<Selection | null>(() => currentState().selection);
  const [filter, setFilterState] = useState<FilterId | null>(() => currentState().filter ?? null);
  const [fuel, setFuelState] = useState<RegionFuel>(() => currentState().fuel ?? DEFAULT_REGION_FUEL);
  const [from, setFrom] = useState<PanelStep | null>(readFrom);

  useEffect(() => {
    const onPopState = () => {
      const state = currentState();
      setViewState(state.view ?? null);
      setSelection(state.selection);
      setFilterState(state.filter ?? null);
      setFuelState(state.fuel ?? DEFAULT_REGION_FUEL);
      setFrom(readFrom());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** Opens a selection; a region opens on `fuel`, the default unless given. */
  const select = useCallback((next: Selection | null, nextFuel: RegionFuel = DEFAULT_REGION_FUEL) => {
    const state = currentState();
    if (sameSelection(state.selection, next) && (state.fuel ?? DEFAULT_REGION_FUEL) === nextFuel) return;
    const search = serializeUrlState({ ...state, selection: next, fuel: nextFuel }, window.location.search);
    push(search);
    setFrom(readFrom());
    setSelection(next);
    setFuelState(nextFuel);
  }, []);

  /** Switches the open region's fuel in place: a view choice, not a new step for Back. */
  const setFuel = useCallback((next: RegionFuel) => {
    const state = currentState();
    window.history.replaceState(window.history.state, '', urlFor(serializeUrlState({ ...state, fuel: next }, window.location.search)));
    setFuelState(next);
  }, []);

  /**
   * Sets or clears the quick filter, closing any open detail so the panel shows the matches.
   * A new history entry, so Back returns to where you were.
   */
  const setFilter = useCallback((next: FilterId | null) => {
    const state = currentState();
    if ((state.filter ?? null) === next && !state.selection) return;
    const search = serializeUrlState({ ...state, filter: next, selection: null }, window.location.search);
    push(search);
    setFrom(readFrom());
    setFilterState(next);
    setSelection(null);
  }, []);

  /**
   * Opens a rail view, or home with null, closing whatever was open so the panel shows the view's list.
   * A new history entry, so Back returns to where you were.
   */
  const setView = useCallback((next: ViewId | null) => {
    const state = currentState();
    if ((state.view ?? null) === next && !state.selection && !state.filter) return;
    const search = serializeUrlState({ ...state, view: next, selection: null, filter: null }, window.location.search);
    push(search);
    setFrom(readFrom());
    setViewState(next);
    setSelection(null);
    setFilterState(null);
  }, []);

  /** Returns to the previous panel state. Never leaves the app. */
  const back = useCallback(() => {
    const pushed = (window.history.state as Record<string, unknown> | null)?.[PUSHED] === true;
    if (pushed) {
      window.history.back();
      return;
    }
    // Opened from a link: step up one level, selection first, then the filter, then the view.
    const state = currentState();
    if (!state.selection && !state.filter && !state.view) return;
    const next = state.selection
      ? { ...state, selection: null }
      : state.filter
        ? { ...state, filter: null }
        : { ...state, view: null };
    window.history.replaceState(null, '', urlFor(serializeUrlState(next, window.location.search)));
    setFrom(null);
    setSelection(next.selection);
    setFilterState(next.filter ?? null);
    setViewState(next.view ?? null);
  }, []);

  /** Camera changes replace the current entry, so panning doesn't flood history. */
  const setCamera = useCallback((camera: Camera) => {
    const state = currentState();
    const search = serializeUrlState({ ...state, camera }, window.location.search);
    window.history.replaceState(window.history.state, '', urlFor(search));
  }, []);

  return { from, view, setView, selection, select, fuel, setFuel, filter, setFilter, back, setCamera, initialCamera: currentState().camera };
}
