import { describe, expect, it } from 'vitest';
import { FEATURES, STORAGE_BOUNDS, US_BOUNDS } from '../src/lib/config';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { basinViewRows, chokepointViewRows } from '../src/lib/summary';
import {
  ENABLED_VIEWS,
  SURFACE_FILTERS,
  parseView,
  scopeMatches,
  selectionEnabled,
  viewHighlight,
  viewPoints,
  visibleLayers,
  type LayerVisibility,
} from '../src/lib/views';
import { parseSelection } from '../src/app/urlState';
import type { ObservationSeries } from '../src/types';
import { basin, chokepoint, lngTerminal, oilTerminal, pipeline } from './fixtures';

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
    expect(parseView('basins')).toBe('basins');
    expect(parseView('nonsense')).toBeNull();
    expect(parseView(null)).toBeNull();
  });

  it('opens Home for a surface that is switched off, and drops its selections from links', () => {
    expect(parseView('storage')).toBe(FEATURES.gasStorage ? 'storage' : null);
    expect(parseView('origins')).toBe(FEATURES.fuelOrigins ? 'origins' : null);
    expect(ENABLED_VIEWS.includes('storage')).toBe(FEATURES.gasStorage);
    expect(selectionEnabled('storage')).toBe(FEATURES.gasStorage);
    expect(selectionEnabled('region')).toBe(FEATURES.fuelOrigins);
    expect(parseSelection('storage/de')).toEqual(FEATURES.gasStorage ? { kind: 'storage', id: 'de' } : null);
    expect(parseSelection('region/padd-1')).toEqual(FEATURES.fuelOrigins ? { kind: 'region', id: 'padd-1' } : null);
    expect(parseSelection('basin/usgs-1174')).toEqual({ kind: 'basin', id: 'usgs-1174' });
  });
});

describe('visibleLayers', () => {
  const all: LayerVisibility = { storage: true, basins: true, pipelines: true, lng: true, terminals: true, chokepoints: true };
  const shown = (v: LayerVisibility) => Object.entries(v).filter(([, on]) => on).map(([id]) => id);

  it('shows only the layers of a surface, whatever the layer list says', () => {
    expect(shown(visibleLayers('pipelines', null, all))).toEqual(['pipelines']);
    expect(shown(visibleLayers('basins', null, all))).toEqual(['basins']);
    expect(shown(visibleLayers('terminals', null, all))).toEqual(['lng', 'terminals']);
    expect(shown(visibleLayers('chokepoints', null, all))).toEqual(['terminals', 'chokepoints']);
    expect(shown(visibleLayers('origins', null, all))).toEqual([]);
  });

  it('adds the layer of the open item, so a chokepoint opened from a pipeline still shows', () => {
    expect(shown(visibleLayers('pipelines', { kind: 'chokepoint' }, all))).toEqual(['pipelines', 'chokepoints']);
    expect(shown(visibleLayers(null, { kind: 'basin' }, { ...all, basins: false }))).toContain('basins');
  });

  it('follows the layer list on Home, with storage only while it is switched on', () => {
    expect(shown(visibleLayers(null, null, { ...all, lng: false }))).toEqual(
      [FEATURES.gasStorage && 'storage', 'basins', 'pipelines', 'terminals', 'chokepoints'].filter(Boolean),
    );
  });
});

describe('basinViewRows', () => {
  const volumes = (remaining: number | null) => ({
    oil: { produced: null, remaining, undiscovered: null },
    gas: { produced: null, remaining: null, undiscovered: null },
  });
  it('puts the most oil remaining first, then basins with no oil figure by name', () => {
    const rows = basinViewRows([
      { ...basin, id: 'usgs-3', name: 'Permian Basin', volumes: null },
      { ...basin, id: 'usgs-4', name: 'Azov-Kuban Basin', volumes: volumes(null) },
      { ...basin, id: 'usgs-1', name: 'North Sea Graben', volumes: volumes(21427) },
      { ...basin, id: 'usgs-2', name: 'Mesopotamian Foredeep Basin', volumes: volumes(235696) },
    ]);
    expect(rows.map((b) => b.name)).toEqual(['Mesopotamian Foredeep Basin', 'North Sea Graben', 'Azov-Kuban Basin', 'Permian Basin']);
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
