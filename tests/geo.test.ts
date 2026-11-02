import { describe, expect, it } from 'vitest';
import type { LineString, MultiPolygon, Polygon } from 'geojson';
import { boundsOf, lineTouchesPolygon, pointInPolygon } from '../src/lib/geo';

const square: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    // hole
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

const multi: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]],
};

describe('boundsOf', () => {
  it('returns west-south and east-north corners', () => {
    expect(boundsOf(multi)).toEqual([
      [0, 0],
      [30, 30],
    ]);
    expect(boundsOf({ type: 'LineString', coordinates: [[5, -2], [-3, 7]] })).toEqual([
      [-3, -2],
      [5, 7],
    ]);
  });
});

describe('pointInPolygon', () => {
  it('handles inside, outside and holes', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon([5, 5], square)).toBe(false);
    expect(pointInPolygon([11, 5], square)).toBe(false);
  });

  it('checks every part of a multipolygon', () => {
    expect(pointInPolygon([25, 25], multi)).toBe(true);
    expect(pointInPolygon([15, 15], multi)).toBe(false);
  });
});

describe('lineTouchesPolygon', () => {
  it('detects a vertex inside', () => {
    const line: LineString = { type: 'LineString', coordinates: [[-5, -5], [2, 2]] };
    expect(lineTouchesPolygon(line, square)).toBe(true);
  });

  it('detects a line passing through without a vertex inside', () => {
    const line: LineString = { type: 'LineString', coordinates: [[-5, 1], [15, 1]] };
    expect(lineTouchesPolygon(line, square)).toBe(true);
  });

  it('a line in another part of the world is rejected', () => {
    const line: LineString = { type: 'LineString', coordinates: [[100, 50], [120, 60]] };
    expect(lineTouchesPolygon(line, square)).toBe(false);
  });

  it('rejects a line that stays outside', () => {
    const line: LineString = { type: 'LineString', coordinates: [[-5, -5], [-5, 15]] };
    expect(lineTouchesPolygon(line, square)).toBe(false);
  });
});
