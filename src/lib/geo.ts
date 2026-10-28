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

function segmentsCross(a: Position, b: Position, c: Position, d: Position): boolean {
  const cross = (p: Position, q: Position, r: Position) =>
    (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when any part of the line lies inside the polygon or crosses its boundary. */
export function lineTouchesPolygon(line: LineString | MultiLineString, geometry: Polygon | MultiPolygon): boolean {
  const lines = line.type === 'LineString' ? [line.coordinates] : line.coordinates;
  if (lines.some((l) => l.some((p) => pointInPolygon(p, geometry)))) return true;
  const rings = polygons(geometry).flat();
  return lines.some((l) =>
    l.slice(1).some((b, i) => {
      const a = l[i]!;
      return rings.some((ring) => ring.slice(1).some((d, k) => segmentsCross(a, b, ring[k]!, d)));
    }),
  );
}
