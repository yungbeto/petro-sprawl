import { describe, expect, it } from 'vitest';
import { GLOBE } from '../src/lib/config';
import { cellIndex, DOT, encodeLandRows, globeFrame, globeSvg, isLand, type LandMask } from '../src/lib/globe';
import { GLOBE_LAND } from '../src/lib/globeLand';

describe('land mask', () => {
  it('packs four cells a hex digit and reads them back', () => {
    const none = Array<boolean>(8).fill(false);
    const cells = [[true, false, false, true, false, false, false, false], none, none, [false, false, false, false, true, true, true, true]];
    const mask: LandMask = { cell: 45, rows: encodeLandRows(cells) };
    expect(mask.rows).toEqual(['90', '00', '00', '0f']);
    expect(isLand(mask, 60, -170)).toBe(true);
    expect(isLand(mask, 60, -100)).toBe(false);
    expect(isLand(mask, 60, -30)).toBe(true);
    expect(isLand(mask, -60, 10)).toBe(true);
    // Longitude wraps; the poles clamp to the end rows.
    expect(isLand(mask, 60, 190)).toBe(true);
    expect(isLand(mask, 90, -170)).toBe(true);
  });

  it('the generated mask has land where land is', () => {
    expect(GLOBE_LAND.rows).toHaveLength(180 / GLOBE_LAND.cell);
    expect(isLand(GLOBE_LAND, 48.9, 2.35)).toBe(true); // Paris
    expect(isLand(GLOBE_LAND, -15.8, -47.9)).toBe(true); // Brasília
    expect(isLand(GLOBE_LAND, 0, -140)).toBe(false); // Pacific
    expect(isLand(GLOBE_LAND, 30, -40)).toBe(false); // Atlantic
  });
});

describe('globeFrame', () => {
  const allLand: LandMask = { cell: 90, rows: ['f', 'f'] };
  const noLand: LandMask = { cell: 90, rows: ['0', '0'] };

  it('fills a disc: corners off, centre on', () => {
    const dots = 12;
    const frame = globeFrame({ mask: allLand, dots, lon: 0, tilt: 0 });
    expect(frame).toHaveLength(dots * dots);
    expect(frame[0]).toBe(DOT.none);
    expect(frame[dots * dots - 1]).toBe(DOT.none);
    expect(frame[6 * dots + 6]).toBe(DOT.land);
    expect(globeFrame({ mask: noLand, dots, lon: 0, tilt: 0 })[6 * dots + 6]).toBe(DOT.ocean);
  });

  it('turns with longitude: a land half shows on one side, then the other', () => {
    // West of 0° is land, east is sea.
    const west: LandMask = { cell: 90, rows: ['c', 'c'] };
    const mid = 6 * GLOBE.dots;
    const facingZero = globeFrame({ mask: west, dots: GLOBE.dots, lon: 0, tilt: 0 });
    expect(facingZero[mid + 1]).toBe(DOT.land);
    expect(facingZero[mid + GLOBE.dots - 2]).toBe(DOT.ocean);
    const facingWest = globeFrame({ mask: west, dots: GLOBE.dots, lon: -90, tilt: 0 });
    expect(facingWest[mid + 1]).toBe(DOT.land);
    expect(facingWest[mid + GLOBE.dots - 2]).toBe(DOT.land);
  });

  it('draws focus cells over land and sea alike', () => {
    const dots = 12;
    const centre = cellIndex(90, 0, 0);
    const frame = globeFrame({ mask: noLand, dots, lon: 0, tilt: 0, focus: new Set([centre]) });
    expect(frame[6 * dots + 6]).toBe(DOT.focus);
    expect(frame.filter((d) => d === DOT.ocean).length).toBeGreaterThan(0);
  });

  it('tilting the north pole forward brings it onto the disc', () => {
    // The northern hemisphere is land.
    const north: LandMask = { cell: 90, rows: ['f', '0'] };
    const flat = globeFrame({ mask: north, dots: 12, lon: 0, tilt: 0 });
    const tilted = globeFrame({ mask: north, dots: 12, lon: 0, tilt: 30 });
    const count = (f: number[]) => f.filter((d) => d === DOT.land).length;
    expect(count(tilted)).toBeGreaterThan(count(flat));
  });
});

describe('globeSvg', () => {
  it('draws a dot for each ocean and land cell, ocean dimmed, none for cells off the disc', () => {
    const svg = globeSvg({ frame: [DOT.none, DOT.ocean, DOT.land, DOT.land], dots: 2, fill: 0.5, oceanOpacity: 0.3 });
    expect(svg.match(/<rect /g)).toHaveLength(3);
    expect(svg).toContain('viewBox="0 0 20 20"');
    expect(svg).toContain('<g class="dots" fill="#fff" opacity="0.3"><rect x="12.5" y="2.5" width="5" height="5"/></g>');
    expect(svg).toContain('<rect x="2.5" y="12.5" width="5" height="5"/><rect x="12.5" y="12.5"');
    expect(svg).toContain('prefers-color-scheme:dark');
    const focused = globeSvg({ frame: [DOT.land, DOT.focus], dots: 2, fill: 0.5, oceanOpacity: 0.3, landOpacity: 0.5 });
    expect(focused).toContain('<g class="dots" fill="#fff" opacity="0.5"><rect x="2.5" y="2.5"');
    expect(focused).toContain('<g class="dots" fill="#fff"><rect x="12.5" y="2.5"');
    expect(globeSvg({ frame: [DOT.land], dots: 1, fill: 0.5, oceanOpacity: 0.3, themed: false })).not.toContain('<style>');
  });
});
