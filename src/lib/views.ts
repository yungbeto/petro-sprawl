// The app's surfaces: what the rail opens. Each fills the panel with a list, shows only its own layers
// on the map, and has its own filter chips. Home is the summary across all of them. Pure.

import type { SelectionKind } from '../app/urlState';
import { FEATURES, STORAGE_BOUNDS, US_BOUNDS, WORLD_BOUNDS } from './config';
import type { FilterId, FilterMatches } from './filters';
import { fuelSurfaceHighlight, type Datasets } from './data';

/** The map's switchable layers. */
export type LayerId = 'storage' | 'basins' | 'pipelines' | 'lng' | 'terminals' | 'chokepoints';
export type LayerVisibility = Record<LayerId, boolean>;

export const VIEW_IDS = ['chokepoints', 'pipelines', 'terminals', 'basins', 'storage', 'origins'] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
  chokepoints: 'Chokepoints',
  pipelines: 'Pipelines',
  terminals: 'Terminals',
  basins: 'Basins',
  storage: 'Gas storage',
  origins: 'Fuel origins',
};

/** Whether a surface is switched on (`FEATURES`); one that's off can't be opened, linked or searched. */
export function viewEnabled(view: ViewId): boolean {
  if (view === 'storage') return FEATURES.gasStorage;
  if (view === 'origins') return FEATURES.fuelOrigins;
  return true;
}

/** The surfaces the rail and search offer, in rail order. */
export const ENABLED_VIEWS: readonly ViewId[] = VIEW_IDS.filter(viewEnabled);

/** Whether a kind of selection belongs to a surface that's switched on: a country is storage, a region fuel origins. */
export function selectionEnabled(kind: SelectionKind): boolean {
  if (kind === 'storage') return viewEnabled('storage');
  if (kind === 'region') return viewEnabled('origins');
  return true;
}

export function parseView(value: string | null): ViewId | null {
  return (ENABLED_VIEWS as readonly string[]).includes(value ?? '') ? (value as ViewId) : null;
}

/**
 * The map layers each surface shows; the rest are off while it's open (decided 2026-11-01). Chokepoints
 * keep the oil terminals, since their cargo is what passes the straits. Fuel origins draws only its region
 * outlines, which aren't a layer here.
 */
export const VIEW_LAYERS: Record<ViewId, LayerId[]> = {
  chokepoints: ['chokepoints', 'terminals'],
  pipelines: ['pipelines'],
  terminals: ['lng', 'terminals'],
  basins: ['basins'],
  storage: ['storage'],
  origins: [],
};

const SELECTION_LAYERS: Record<SelectionKind, LayerId | null> = {
  pipeline: 'pipelines',
  chokepoint: 'chokepoints',
  basin: 'basins',
  storage: 'storage',
  lng: 'lng',
  terminal: 'terminals',
  region: null,
};

/**
 * What the map draws. In a surface, its own layers and the open item's, whatever the layer list says.
 * On Home, the layer list, with the open item's layer always on, and storage only while it's switched on.
 */
export function visibleLayers(view: ViewId | null, selection: { kind: SelectionKind } | null, chosen: LayerVisibility): LayerVisibility {
  const selected = selection ? SELECTION_LAYERS[selection.kind] : null;
  const shown = (id: LayerId) => {
    if (id === 'storage' && !FEATURES.gasStorage) return false;
    if (id === selected) return true;
    return view ? VIEW_LAYERS[view].includes(id) : chosen[id];
  };
  return {
    storage: shown('storage'),
    basins: shown('basins'),
    pipelines: shown('pipelines'),
    lng: shown('lng'),
    terminals: shown('terminals'),
    chokepoints: shown('chokepoints'),
  };
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
  // Basins and storage are areas, not assets the chips match.
  basins: [],
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
    case 'basins':
    case 'storage':
      // No assets show; the outlines or the fill are the whole map.
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
    case 'basins':
      // Every mapped pipeline, terminal or basin, worldwide.
      return WORLD_BOUNDS;
    case 'storage':
      return STORAGE_BOUNDS;
    case 'origins':
      return US_BOUNDS;
  }
}
