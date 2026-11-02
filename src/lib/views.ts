// The app's surfaces: what the rail opens. Each fills the panel with a list, shows only its own layers
// on the map, and has its own filter chips. Home is the summary across all of them. Pure.

import type { SelectionKind } from '../app/urlState';
import { FEATURES, PHONE_TABS, STORAGE_BOUNDS, THEATER_BOUNDS, WORLD_BOUNDS } from './config';
import type { FilterId, FilterMatches } from './filters';
import { importsSurfaceHighlight } from './crudeImports';
import type { Datasets } from './data';

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
  origins: 'Oil origins',
};

/** Whether a surface is switched on (`FEATURES`); one that's off can't be opened, linked or searched. */
export function viewEnabled(view: ViewId): boolean {
  if (view === 'storage') return FEATURES.gasStorage;
  if (view === 'origins') return FEATURES.fuelOrigins;
  return true;
}

/** The surfaces the rail and search offer, in rail order. */
export const ENABLED_VIEWS: readonly ViewId[] = VIEW_IDS.filter(viewEnabled);

/** Whether a kind of selection belongs to a surface that's switched on: a country is storage or oil origins, a region fuel origins. */
export function selectionEnabled(kind: SelectionKind): boolean {
  if (kind === 'country') return viewEnabled('storage') || viewEnabled('origins');
  if (kind === 'region') return viewEnabled('origins');
  return true;
}

export function parseView(value: string | null): ViewId | null {
  return (ENABLED_VIEWS as readonly string[]).includes(value ?? '') ? (value as ViewId) : null;
}

/**
 * The map layers each surface shows; the rest are off while it's open (decided 2026-11-01). Chokepoints
 * keep the oil terminals, since their cargo is what passes the straits. Oil origins draws the importing
 * countries, and the chokepoints and terminals on cited routes (M10); a US fuel region draws only its
 * outlines, which aren't a layer here.
 */
export const VIEW_LAYERS: Record<ViewId, LayerId[]> = {
  chokepoints: ['chokepoints', 'terminals'],
  pipelines: ['pipelines'],
  terminals: ['lng', 'terminals'],
  basins: ['basins'],
  storage: ['storage'],
  origins: ['storage', 'chokepoints', 'terminals'],
};

/** The layers an open item brings with it. A basin brings the pipelines that touch it (decided 2026-11-01). */
const SELECTION_LAYERS: Record<SelectionKind, LayerId[]> = {
  pipeline: ['pipelines'],
  chokepoint: ['chokepoints'],
  basin: ['basins', 'pipelines'],
  country: ['storage'],
  lng: ['lng'],
  terminal: ['terminals'],
  region: [],
};

/**
 * What the map draws. In a surface, its own layers and the open item's, whatever the layer list says.
 * On Home, the layer list, with the open item's layer always on, and storage only while it's switched on.
 */
export function visibleLayers(view: ViewId | null, selection: { kind: SelectionKind } | null, chosen: LayerVisibility): LayerVisibility {
  const selected = selection ? SELECTION_LAYERS[selection.kind] : [];
  const shown = (id: LayerId) => {
    if (id === 'storage' && !FEATURES.gasStorage) return false;
    if (selected.includes(id)) return true;
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
 * Which pipelines the map draws and keeps bright around a basin (decided 2026-11-01). On the basins
 * surface pipelines belong to a basin: none until one is open, then only the focused basin's, which stay
 * while you open its pipelines (`basinPipelines` is that basin's, null with none focused); a pipeline
 * opened there without a basin shows alone. Elsewhere an open basin's pipelines stay bright and the rest
 * fade. A quick filter, while on, decides what stays bright. Null when nothing changes.
 */
export function basinPipelineFocus(
  view: ViewId | null,
  basinPipelines: Set<string> | null,
  selectedPipeline: string | null,
  highlight: FilterMatches | null,
  filtering: boolean,
  data: Datasets,
): { only: Set<string> | null; highlight: FilterMatches | null } | null {
  if (view === 'basins') {
    const only = new Set(basinPipelines);
    if (selectedPipeline) only.add(selectedPipeline);
    const bright = basinPipelines && !filtering && highlight ? { ...highlight, pipelines: basinPipelines } : highlight;
    return { only, highlight: bright };
  }
  if (!basinPipelines) return null;
  const base = highlight ?? {
    pipelines: none(),
    chokepoints: new Set(data.chokepoints.map((c) => c.id)),
    lng: new Set(data.lngTerminals.map((t) => t.id)),
    terminals: new Set(data.oilTerminals.map((t) => t.id)),
  };
  return { only: view ? basinPipelines : null, highlight: filtering ? highlight : { ...base, pipelines: basinPipelines } };
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
      return importsSurfaceHighlight(data);
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
      return WORLD_BOUNDS;
  }
}

/**
 * The phone tab bar's sections and those under More. All of them fit when Home and the sections take
 * no more than PHONE_TABS.slots; otherwise the bar keeps PHONE_TABS.bar (as many as fit beside Home and
 * More) and the rest go under More, in rail order.
 */
export function phoneTabs(enabled: readonly ViewId[] = ENABLED_VIEWS): { bar: ViewId[]; more: ViewId[] } {
  if (1 + enabled.length <= PHONE_TABS.slots) return { bar: [...enabled], more: [] };
  const room = PHONE_TABS.slots - 2;
  const preferred = (PHONE_TABS.bar as readonly ViewId[]).filter((v) => enabled.includes(v));
  const bar = [...preferred, ...enabled.filter((v) => !preferred.includes(v))].slice(0, room);
  return { bar: enabled.filter((v) => bar.includes(v)), more: enabled.filter((v) => !bar.includes(v)) };
}

/**
 * Where the camera goes when an item closes (decided 2026-11-02): back to the camera it had before, or,
 * opened from a link with none, the surface's own frame (Home's is the map a first visit opens on).
 */
export function closeFrame(
  camera: { lon: number; lat: number; zoom: number } | null,
  view: ViewId | null,
  data: Datasets,
): { camera: { lon: number; lat: number; zoom: number } } | { points: [number, number][] } {
  if (camera) return { camera };
  return { points: view ? viewPoints(view, data) : THEATER_BOUNDS };
}
