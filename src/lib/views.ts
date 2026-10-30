// The app's surfaces: what the rail opens. Each fills the panel with a list, sets what the map shows,
// and has its own filter chips. Home is the summary across all of them. Pure.

import { STORAGE_BOUNDS, US_BOUNDS, WORLD_BOUNDS } from './config';
import type { FilterId, FilterMatches } from './filters';
import { fuelSurfaceHighlight, type Datasets } from './data';

export const VIEW_IDS = ['chokepoints', 'pipelines', 'terminals', 'storage', 'origins'] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
  chokepoints: 'Chokepoints',
  pipelines: 'Pipelines',
  terminals: 'Terminals',
  storage: 'Gas storage',
  origins: 'Fuel origins',
};

export function parseView(value: string | null): ViewId | null {
  return (VIEW_IDS as readonly string[]).includes(value ?? '') ? (value as ViewId) : null;
}

/**
 * Each surface's filter chips. Home keeps the ones that cut across kinds; a surface keeps the ones
 * about its own kind, and they match within it only (`scopeMatches`).
 */
export const SURFACE_FILTERS: Record<ViewId | 'home', FilterId[]> = {
  home: ['offline', 'below-baseline', 'unverified'],
  chokepoints: ['below-baseline'],
  pipelines: ['offline', 'unverified', 'metered', 'gas', 'oil'],
  // Gas and oil would repeat the surface's own LNG and oil switch.
  terminals: ['offline', 'unverified', 'metered'],
  // Storage is a layer of countries, not assets the chips match.
  storage: [],
  origins: [],
};

const none = () => new Set<string>();

/** What the map keeps bright in a view; everything else fades. */
export function viewHighlight(view: ViewId, data: Datasets): FilterMatches {
  switch (view) {
    case 'chokepoints':
      // The straits, and the oil terminals whose cargo has to pass one.
      return {
        pipelines: none(),
        chokepoints: new Set(data.chokepoints.map((c) => c.id)),
        lng: none(),
        terminals: new Set(data.oilTerminals.filter((t) => t.exitVia.length > 0).map((t) => t.id)),
      };
    case 'pipelines':
      return { pipelines: new Set(data.pipelines.map((p) => p.id)), chokepoints: none(), lng: none(), terminals: none() };
    case 'terminals':
      return {
        pipelines: none(),
        chokepoints: none(),
        lng: new Set(data.lngTerminals.map((t) => t.id)),
        terminals: new Set(data.oilTerminals.map((t) => t.id)),
      };
    case 'storage':
      // Every asset fades so the storage fill stands out.
      return { pipelines: none(), chokepoints: none(), lng: none(), terminals: none() };
    case 'origins':
      return fuelSurfaceHighlight(data);
  }
}

/** A filter's matches within a surface: on Home all of them, in a view only what the view keeps. */
export function scopeMatches(matches: FilterMatches, view: ViewId | null, data: Datasets): FilterMatches {
  if (!view) return matches;
  const lit = viewHighlight(view, data);
  const within = (a: Set<string>, b: Set<string>) => new Set([...a].filter((id) => b.has(id)));
  return {
    pipelines: within(matches.pipelines, lit.pipelines),
    chokepoints: within(matches.chokepoints, lit.chokepoints),
    lng: within(matches.lng, lit.lng),
    terminals: within(matches.terminals, lit.terminals),
  };
}

/** The points a view frames when it opens. */
export function viewPoints(view: ViewId, data: Datasets): [number, number][] {
  switch (view) {
    case 'chokepoints':
      return data.chokepoints.map((c) => c.point);
    case 'pipelines':
    case 'terminals':
      // Every mapped pipeline or terminal, worldwide.
      return WORLD_BOUNDS;
    case 'storage':
      return STORAGE_BOUNDS;
    case 'origins':
      return US_BOUNDS;
  }
}
