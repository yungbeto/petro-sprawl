import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { frame, headlineFrame, headlineThumb } from '../src/lib/thumbnail';
import { THUMBNAIL } from '../src/lib/config';
import type { Chokepoint, Country, OilTerminal, Pipeline } from '../src/types';

const square = (w: number, s: number, e: number, n: number): Country['geometry'] => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});

const data = (over: Partial<Datasets>): Datasets => ({ ...EMPTY_DATASETS, ...over });
const strait = { id: 'hormuz', name: 'Strait of Hormuz', point: [56.86, 26.3], transitSeriesId: 'none' } as unknown as Chokepoint;
const terminal = { id: 'kharg', name: 'Kharg Island', point: [50.3, 29.23], evidence: [] } as unknown as OilTerminal;
const pipeline = {
  id: 'btc',
  name: 'BTC',
  geometry: { type: 'LineString', coordinates: [[49.9, 40.4], [44.8, 41.7], [35.9, 36.9]] },
  evidence: [],
} as unknown as Pipeline;

describe('frame', () => {
  it('frames a lone point at the minimum span, padded, and keeps it square', () => {
    const f = frame([[[56.86, 26.3]]])!;
    expect(f.span).toBeCloseTo(THUMBNAIL.minSpanDeg * (1 + 2 * THUMBNAIL.padding));
    expect(f.cy).toBe(26.3);
  });
  it('fits a long route with room around it', () => {
    const f = frame([pipeline.geometry.coordinates as [number, number][]])!;
    expect(f.span).toBeGreaterThan((49.9 - 35.9) * f.kx);
  });
  it('gives nothing to frame for no points', () => {
    expect(frame([])).toBeNull();
  });
});

describe('headlineThumb', () => {
  it("draws each place the map's way, centred when alone, over the countries near it", () => {
    const thumb = headlineThumb(['chokepoint/hormuz'], data({
      chokepoints: [strait],
      countries: [
        { id: 'IR', name: 'Iran', geometry: square(50, 26.6, 60, 32) },
        { id: 'BR', name: 'Brazil', geometry: square(-60, -20, -40, 0) },
      ],
    }))!;
    expect(thumb.marks).toEqual([{ kind: 'ring', x: THUMBNAIL.size / 2, y: THUMBNAIL.size / 2, tone: 'ink' }]);
    expect(thumb.land.startsWith('M')).toBe(true);
    // Brazil is far outside the frame, so only Iran's one ring is drawn.
    expect(thumb.land.match(/M/g)).toHaveLength(1);
  });
  it('draws a route as a line and a terminal as a point, toned by status, skipping what is not loaded', () => {
    const thumb = headlineThumb(['pipeline/btc', 'terminal/kharg', 'pipeline/missing'], data({ pipelines: [pipeline], oilTerminals: [terminal] }))!;
    expect(thumb.marks.map((m) => [m.kind, m.tone])).toEqual([
      ['line', 'status-unknown'],
      ['point', 'status-unknown'],
    ]);
    for (const m of thumb.marks) if (m.kind === 'point') expect(m.x).toBeGreaterThanOrEqual(0);
  });
  it('is null when none of the places is loaded', () => {
    expect(headlineThumb(['pipeline/missing'], data({}))).toBeNull();
  });
});

describe('headlineFrame', () => {
  it("gives the thumbnail's square as map corners, around the place it shows", () => {
    const [[w, s], [e, n]] = headlineFrame(['chokepoint/hormuz'], data({ chokepoints: [strait] }))!;
    expect(w).toBeLessThan(56.86);
    expect(e).toBeGreaterThan(56.86);
    expect(s).toBeLessThan(26.3);
    expect(n).toBeGreaterThan(26.3);
    expect(n - s).toBeCloseTo(THUMBNAIL.minSpanDeg * (1 + 2 * THUMBNAIL.padding));
    expect(headlineFrame(['pipeline/missing'], data({}))).toBeNull();
  });
  it('names the places a thumbnail draws, for its label', () => {
    expect(headlineThumb(['pipeline/btc', 'terminal/kharg'], data({ pipelines: [pipeline], oilTerminals: [terminal] }))?.names).toEqual(['BTC', 'Kharg Island']);
  });
});
