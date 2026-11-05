// A headline's map thumbnail (added 2026-11-05): the places it names, drawn from our own geometry over the
// country outlines, in the colors the map gives them. No image comes from the article, so there's nothing to
// license and nothing loaded from the publisher. Pure: the view draws the paths (NewsList.tsx).

import type { Country } from '../types';
import { THUMBNAIL } from './config';
import { chokepointFlow } from './flow';
import { lngStatus, pipelineStatus, terminalStatus } from './encoding';
import { seriesById, type Datasets } from './data';

type LonLat = [number, number];

/** A mark's color, as a class suffix: a status (`status-operating`) or a flow band (`flow-below`). */
export type ThumbTone = `status-${string}` | `flow-${string}` | 'ink';

export type ThumbMark =
  | { kind: 'line'; d: string; tone: ThumbTone }
  | { kind: 'point' | 'ring'; x: number; y: number; tone: ThumbTone };

export interface Thumb {
  /** The land, one path, in the thumbnail's own units (0 to THUMBNAIL.size). */
  land: string;
  marks: ThumbMark[];
  /** The places drawn, by name, in order: for a label. */
  names: string[];
}

interface Shape {
  name: string;
  kind: ThumbMark['kind'];
  lines: LonLat[][];
  tone: ThumbTone;
}

/** What a ref draws: a pipeline's route, a strait's ring, a terminal's point. Null when it isn't loaded. */
function shapeOf(ref: string, data: Datasets): Shape | null {
  const [kind, id] = ref.split('/') as [string, string];
  if (kind === 'pipeline') {
    const p = data.pipelines.find((x) => x.id === id);
    if (!p) return null;
    const lines = p.geometry.type === 'LineString' ? [p.geometry.coordinates as LonLat[]] : (p.geometry.coordinates as LonLat[][]);
    return { name: p.name, kind: 'line', lines, tone: `status-${pipelineStatus(p)}` };
  }
  if (kind === 'chokepoint') {
    const c = data.chokepoints.find((x) => x.id === id);
    if (!c) return null;
    const band = chokepointFlow(seriesById(data, c.transitSeriesId))?.band;
    return { name: c.name, kind: 'ring', lines: [[c.point]], tone: band ? `flow-${band}` : 'ink' };
  }
  if (kind === 'lng') {
    const t = data.lngTerminals.find((x) => x.id === id);
    return t ? { name: t.name, kind: 'point', lines: [[t.point]], tone: `status-${lngStatus(t)}` } : null;
  }
  if (kind === 'terminal') {
    const t = data.oilTerminals.find((x) => x.id === id);
    return t ? { name: t.name, kind: 'point', lines: [[t.point]], tone: `status-${terminalStatus(t)}` } : null;
  }
  return null;
}

/** The places a thumbnail draws: up to THUMBNAIL.maxAssets of the refs that are loaded, in order. */
function shapesFor(refs: readonly string[], data: Datasets): Shape[] {
  return refs.flatMap((r) => shapeOf(r, data) ?? []).slice(0, THUMBNAIL.maxAssets);
}

/**
 * What a thumbnail shows, as the map's south-west and north-east corners, so a click on it frames the
 * same square on the map (added 2026-11-05). Null when none of the places is loaded.
 */
export function headlineFrame(refs: readonly string[], data: Datasets): [LonLat, LonLat] | null {
  const f = frame(shapesFor(refs, data).flatMap((s) => s.lines));
  if (!f) return null;
  const half = f.span / 2;
  return [
    [(f.cx - half) / f.kx, f.cy - half],
    [(f.cx + half) / f.kx, f.cy + half],
  ];
}

/** The square, in degrees, that frames every shape with room around it: at least THUMBNAIL.minSpanDeg across. */
export function frame(lines: LonLat[][]): { cx: number; cy: number; span: number; kx: number } | null {
  const points = lines.flat();
  if (!points.length) return null;
  const lats = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const cy = (minLat + maxLat) / 2;
  // Equirectangular, with longitude narrowed by the frame's latitude so the shapes keep their proportions.
  const kx = Math.cos((cy * Math.PI) / 180);
  const xs = points.map((p) => p[0] * kx);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = Math.max(maxX - minX, maxLat - minLat, THUMBNAIL.minSpanDeg) * (1 + 2 * THUMBNAIL.padding);
  return { cx: (minX + maxX) / 2, cy, span, kx };
}

const boxes = new WeakMap<Country, [number, number, number, number]>();

/** A country's bounds, [west, south, east, north], worked out once. */
function boundsOf(country: Country): [number, number, number, number] {
  const known = boxes.get(country);
  if (known) return known;
  const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons)
    for (const [lon, lat] of polygon[0] as LonLat[]) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  const box: [number, number, number, number] = [w, s, e, n];
  boxes.set(country, box);
  return box;
}

/**
 * The thumbnail for a headline's places, or null when none of them is loaded. Up to THUMBNAIL.maxAssets
 * places, in the order the headline names them.
 */
export function headlineThumb(refs: readonly string[], data: Datasets): Thumb | null {
  const shapes = shapesFor(refs, data);
  const f = frame(shapes.flatMap((s) => s.lines));
  if (!f) return null;
  const { size } = THUMBNAIL;
  const x = (lon: number) => ((lon * f.kx - (f.cx - f.span / 2)) / f.span) * size;
  const y = (lat: number) => ((f.cy + f.span / 2 - lat) / f.span) * size;
  const path = (line: LonLat[], close: boolean) => {
    let d = '';
    let last: [number, number] | null = null;
    for (const [lon, lat] of line) {
      const p: [number, number] = [x(lon), y(lat)];
      // Points closer than THUMBNAIL.step on screen add nothing at this size.
      if (last && Math.abs(p[0] - last[0]) < THUMBNAIL.step && Math.abs(p[1] - last[1]) < THUMBNAIL.step) continue;
      d += `${last ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      last = p;
    }
    return d && close ? `${d}Z` : d;
  };

  // Countries whose bounds reach the frame, with a margin so a coast just outside still shows its edge.
  const half = f.span / 2;
  const west = (f.cx - half) / f.kx - 1;
  const east = (f.cx + half) / f.kx + 1;
  const south = f.cy - half - 1;
  const north = f.cy + half + 1;
  let land = '';
  for (const country of data.countries) {
    const [w, s, e, n] = boundsOf(country);
    if (e < west || w > east || n < south || s > north) continue;
    const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) land += path(ring as LonLat[], true);
  }

  const marks: ThumbMark[] = shapes.flatMap((s): ThumbMark[] => {
    if (s.kind === 'line') return [{ kind: 'line', d: s.lines.map((l) => path(l, false)).join(''), tone: s.tone }];
    const [lon, lat] = s.lines[0]![0]!;
    return [{ kind: s.kind, x: Number(x(lon).toFixed(1)), y: Number(y(lat).toFixed(1)), tone: s.tone }];
  });
  return { land, marks, names: shapes.map((s) => s.name) };
}
