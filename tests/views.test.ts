import { describe, expect, it } from 'vitest';
import { STORAGE_BOUNDS, US_BOUNDS } from '../src/lib/config';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { chokepointViewRows } from '../src/lib/summary';
import { SURFACE_FILTERS, parseView, scopeMatches, viewHighlight, viewPoints } from '../src/lib/views';
import type { ObservationSeries } from '../src/types';
import { chokepoint, lngTerminal, oilTerminal, pipeline } from './fixtures';

/** Daily transits from 2020 to the end date: `usual` every day, then `recent` for the last week. */
const transits = (id: string, usual: number, recent: number): ObservationSeries => {
  const points = [];
  const end = Date.UTC(2026, 9, 25);
  for (let t = Date.UTC(2020, 0, 1); t <= end; t += 86_400_000) {
    points.push({ date: new Date(t).toISOString().slice(0, 10), value: end - t < 7 * 86_400_000 ? recent : usual });
  }
  return { id: `portwatch-${id}`, metric: 'tanker_transits', unit: 'count/day', points };
};

const data: Datasets = {
  ...EMPTY_DATASETS,
  chokepoints: [chokepoint('suez', [32.5, 30]), chokepoint('hormuz', [56.5, 26.5]), chokepoint('turkish', [29, 41]), chokepoint('malacca', [101, 2.5])],
  series: [transits('suez', 50, 45), transits('hormuz', 40, 1)],
  oilTerminals: [oilTerminal({ id: 'ras-tanura', exitVia: ['hormuz'] }), oilTerminal({ id: 'primorsk', exitVia: [] })],
};

describe('parseView', () => {
  it('accepts known views only', () => {
    expect(parseView('chokepoints')).toBe('chokepoints');
    expect(parseView('nonsense')).toBeNull();
    expect(parseView(null)).toBeNull();
  });
});

describe('chokepointViewRows', () => {
  it('puts the furthest from baseline first, then those without transits by name', () => {
    const rows = chokepointViewRows(data);
    expect(rows.map((r) => r.selection.id)).toEqual(['hormuz', 'suez', 'malacca', 'turkish']);
    expect(rows[0]!.transits?.band).toBe('below');
    expect(rows[2]!.transits).toBeNull();
    expect(rows[0]!.cargo).toBeNull();
  });
});

describe('the chokepoints view on the map', () => {
  it('keeps the straits and the terminals that ship through them bright', () => {
    const lit = viewHighlight('chokepoints', data);
    expect([...lit.chokepoints]).toEqual(['suez', 'hormuz', 'turkish', 'malacca']);
    expect([...lit.terminals]).toEqual(['ras-tanura']);
    expect(lit.pipelines.size).toBe(0);
  });

  it('frames every chokepoint', () => {
    expect(viewPoints('chokepoints', data)).toHaveLength(4);
  });
});

describe('the storage and fuel origins views on the map', () => {
  it('fade every asset for storage, and frame Europe and the lower 48', () => {
    const lit = viewHighlight('storage', data);
    expect(lit.pipelines.size + lit.chokepoints.size + lit.lng.size + lit.terminals.size).toBe(0);
    expect(viewPoints('storage', data)).toEqual(STORAGE_BOUNDS);
    expect(viewPoints('origins', data)).toEqual(US_BOUNDS);
  });

  it('keep nothing bright for fuel origins without regions', () => {
    const lit = viewHighlight('origins', data);
    expect(lit.chokepoints.size + lit.terminals.size).toBe(0);
  });
});

describe('surface filters', () => {
  it('match within the surface only', () => {
    const matches = { pipelines: new Set(['p1']), chokepoints: new Set(['hormuz']), lng: new Set(['l1']), terminals: new Set(['ras-tanura']) };
    const inPipelines = scopeMatches(matches, 'pipelines', { ...data, pipelines: [pipeline({ id: 'p1' }), pipeline({ id: 'p2' })] });
    expect([...inPipelines.pipelines]).toEqual(['p1']);
    expect(inPipelines.chokepoints.size + inPipelines.lng.size + inPipelines.terminals.size).toBe(0);
    expect(scopeMatches(matches, null, data)).toBe(matches);
    expect([...scopeMatches(matches, 'chokepoints', data).terminals]).toEqual(['ras-tanura']);
    const inTerminals = scopeMatches(matches, 'terminals', { ...data, lngTerminals: [lngTerminal({ id: 'l1' })] });
    expect([...inTerminals.lng, ...inTerminals.terminals]).toEqual(['l1', 'ras-tanura']);
    expect(inTerminals.pipelines.size + inTerminals.chokepoints.size).toBe(0);
  });

  it('give each surface chips about its own kind', () => {
    expect(SURFACE_FILTERS.chokepoints).toEqual(['below-baseline']);
    expect(SURFACE_FILTERS.pipelines).not.toContain('below-baseline');
    expect(SURFACE_FILTERS.terminals).toEqual(['offline', 'unverified', 'metered']);
  });
});
