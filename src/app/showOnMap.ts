// "Show on map" without opening anything (added 2026-11-05): a headline's thumbnail moves the map to the
// square it draws, and leaves the selection, the URL and the page as they are. App provides it; any list
// of headlines can use it without the callback passing through every panel.

import { createContext, useContext } from 'react';

/** Frames the map on these corners (south-west, north-east). Null outside the app, where nothing moves. */
export type ShowOnMap = (corners: [[number, number], [number, number]]) => void;

export const ShowOnMapContext = createContext<ShowOnMap | null>(null);

export function useShowOnMap(): ShowOnMap | null {
  return useContext(ShowOnMapContext);
}
