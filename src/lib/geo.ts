import type { Geometry, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';

export type Bounds = [[number, number], [number, number]];

function eachPosition(geometry: Geometry, fn: (p: Position) => void): void {
  switch (geometry.type) {
    case 'Point':
      fn(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      geometry.coordinates.forEach(fn);
      break;
    case 'MultiLineString':
    case 'Polygon':
      geometry.coordinates.forEach((line) => line.forEach(fn));
      break;
    case 'MultiPolygon':
      geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(fn)));
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach((g) => eachPosition(g, fn));
      break;
  }
}

/** [[west, south], [east, north]]. Does not handle geometries crossing the antimeridian. */
export function boundsOf(geometry: Geometry): Bounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  eachPosition(geometry, ([lon = 0, lat = 0]) => {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });
  return [
    [west, south],
    [east, north],
  ];
}

function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i]!;
    const [xj = 0, yj = 0] = ring[j]!;
    if (yi > y! !== yj > y! && x! < ((xj - xi) * (y! - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygons(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Even-odd test against the outer ring, excluding holes. */
export function pointInPolygon(point: Position, geometry: Polygon | MultiPolygon): boolean {
  return polygons(geometry).some(
    ([outer, ...holes]) => !!outer && pointInRing(point, outer) && !holes.some((h) => pointInRing(point, h)),
  );
}

/** 'cross' when the segments properly cross; 'touch' when they meet only at an end or overlap along a line. */
function segmentsMeet(a: Position, b: Position, c: Position, d: Position): 'cross' | 'touch' | 'none' {
  const cross = (p: Position, q: Position, r: Position) =>
    (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 'cross';
  if (d1 * d2 <= 0 && d3 * d4 <= 0) return 'touch';
  return 'none';
}

/** A polygon's edges bucketed on a grid over its bounds, so a segment is tested only against the edges near it. */
interface EdgeIndex {
  bounds: Bounds;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cells: [Position, Position][][];
}

const EDGE_GRID = 64;
const edgeIndexes = new WeakMap<Polygon | MultiPolygon, EdgeIndex>();
const lineBounds = new WeakMap<LineString | MultiLineString, Bounds>();

function edgeIndex(geometry: Polygon | MultiPolygon): EdgeIndex {
  const cached = edgeIndexes.get(geometry);
  if (cached) return cached;
  const bounds = boundsOf(geometry);
  const cols = EDGE_GRID;
  const rows = EDGE_GRID;
  const cellW = (bounds[1][0] - bounds[0][0]) / cols || 1;
  const cellH = (bounds[1][1] - bounds[0][1]) / rows || 1;
  const index: EdgeIndex = { bounds, cols, rows, cellW, cellH, cells: Array.from({ length: cols * rows }, () => []) };
  for (const ring of polygons(geometry).flat()) {
    for (let k = 1; k < ring.length; k++) {
      const edge: [Position, Position] = [ring[k - 1]!, ring[k]!];
      eachCell(index, edge[0], edge[1], (cell) => cell.push(edge));
    }
  }
  edgeIndexes.set(geometry, index);
  return index;
}

/** Calls fn for each grid cell the segment's bounding box covers, clamped to the grid. */
function eachCell(index: EdgeIndex, a: Position, b: Position, fn: (cell: [Position, Position][]) => void): void {
  const { bounds, cols, rows, cellW, cellH, cells } = index;
  const col = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - bounds[0][0]) / cellW)));
  const row = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - bounds[0][1]) / cellH)));
  const c0 = col(Math.min(a[0]!, b[0]!));
  const c1 = col(Math.max(a[0]!, b[0]!));
  const r0 = row(Math.min(a[1]!, b[1]!));
  const r1 = row(Math.max(a[1]!, b[1]!));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(cells[r * cols + c]!);
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a[0][0] <= b[1][0] && b[0][0] <= a[1][0] && a[0][1] <= b[1][1] && b[0][1] <= a[1][1];
}

/**
 * True when any part of the line lies inside the polygon or crosses its boundary. A part that never
 * crosses the boundary is all inside or all outside, so its first point decides.
 */
export function lineTouchesPolygon(line: LineString | MultiLineString, geometry: Polygon | MultiPolygon): boolean {
  const index = edgeIndex(geometry);
  let own = lineBounds.get(line);
  if (!own) lineBounds.set(line, (own = boundsOf(line)));
  if (!boundsOverlap(own, index.bounds)) return false;
  const parts = line.type === 'LineString' ? [line.coordinates] : line.coordinates;
  return parts.some((part) => {
    if (part.length === 0) return false;
    if (pointInPolygon(part[0]!, geometry)) return true;
    // A segment that only touches the boundary (through a corner, along an edge) may still enter: then
    // the first point can't speak for the rest, so every point is tested.
    let touched = false;
    for (let i = 1; i < part.length; i++) {
      const a = part[i - 1]!;
      const b = part[i]!;
      let crosses = false;
      eachCell(index, a, b, (cell) => {
        for (const [c, d] of cell) {
          if (crosses) return;
          const meet = segmentsMeet(a, b, c, d);
          if (meet === 'cross') crosses = true;
          else if (meet === 'touch') touched = true;
        }
      });
      if (crosses) return true;
    }
    return touched && part.some((p) => pointInPolygon(p, geometry));
  });
}
