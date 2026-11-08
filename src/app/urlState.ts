// URL is the source of truth for selection and camera.
// Format: ?view=<view>&sel=<kind>/<id>&fuel=<fuel>&f=<filter>&at=<lon>,<lat>,<zoom>

import { CAMERA_PRECISION, DEFAULT_REGION_FUEL, REGION_FUELS, type RegionFuel } from '../lib/config';
import { parseFilter, type FilterId } from '../lib/filters';
import { parseView, selectionEnabled, type ViewId } from '../lib/views';

export const SELECTION_KINDS = ['pipeline', 'chokepoint', 'basin', 'shale', 'country', 'lng', 'terminal', 'refinery', 'field', 'region'] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export interface Selection {
  kind: SelectionKind;
  id: string;
}

export interface Camera {
  lon: number;
  lat: number;
  zoom: number;
}

export interface UrlState {
  /** The rail view the panel is in; it stays while you open things from it. Absent means home. */
  view?: ViewId | null;
  selection: Selection | null;
  /** The active quick filter. Absent from older links, which is the same as none. */
  filter?: FilterId | null;
  /** The fuel a region view shows. Left out of the URL for the default. */
  fuel?: RegionFuel;
  camera: Camera | null;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function parseSelection(value: string | null): Selection | null {
  if (!value) return null;
  const slash = value.indexOf('/');
  if (slash < 0) return null;
  // A country page was `storage/<code>` before it held oil imports too (M10); old links still open it.
  const kind = value.slice(0, slash) === 'storage' ? 'country' : value.slice(0, slash);
  const id = value.slice(slash + 1);
  if (!(SELECTION_KINDS as readonly string[]).includes(kind)) return null;
  // A country or a region opens a surface that's switched off: the link opens Home instead.
  if (!selectionEnabled(kind as SelectionKind)) return null;
  if (!ID_PATTERN.test(id)) return null;
  return { kind: kind as SelectionKind, id };
}

export function parseCamera(value: string | null): Camera | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.some((p) => p.trim() === '')) return null;
  const [lon, lat, zoom] = parts.map(Number) as [number, number, number];
  if (![lon, lat, zoom].every(Number.isFinite)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90 || zoom < 0 || zoom > 24) return null;
  return { lon, lat, zoom };
}

export function parseFuel(value: string | null): RegionFuel {
  return (REGION_FUELS as readonly string[]).includes(value ?? '') ? (value as RegionFuel) : DEFAULT_REGION_FUEL;
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return {
    view: parseView(params.get('view')),
    selection: parseSelection(params.get('sel')),
    filter: parseFilter(params.get('f')),
    fuel: parseFuel(params.get('fuel')),
    camera: parseCamera(params.get('at')),
  };
}

export function formatCamera({ lon, lat, zoom }: Camera): string {
  const { lonLat, zoom: z } = CAMERA_PRECISION;
  return `${lon.toFixed(lonLat)},${lat.toFixed(lonLat)},${zoom.toFixed(z)}`;
}

/** Returns a search string ("" or "?..."), keeping any unrelated params in `base`. */
export function serializeUrlState(state: UrlState, base = ''): string {
  const params = new URLSearchParams(base);
  if (state.view) params.set('view', state.view);
  else params.delete('view');
  if (state.selection) params.set('sel', `${state.selection.kind}/${state.selection.id}`);
  else params.delete('sel');
  if (state.selection?.kind === 'region' && state.fuel && state.fuel !== DEFAULT_REGION_FUEL) params.set('fuel', state.fuel);
  else params.delete('fuel');
  if (state.filter) params.set('f', state.filter);
  else params.delete('f');
  if (state.camera) params.set('at', formatCamera(state.camera));
  else params.delete('at');
  // Keep "/" and "," readable in the address bar.
  const query = params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',');
  return query ? `?${query}` : '';
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return a?.kind === b?.kind && a?.id === b?.id;
}
