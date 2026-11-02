import { describe, expect, it } from 'vitest';
import { FEATURES, STORAGE_BOUNDS, WORLD_BOUNDS } from '../src/lib/config';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { basinViewRows, chokepointViewRows } from '../src/lib/summary';
import {
  ENABLED_VIEWS,
  SURFACE_FILTERS,
  basinPipelineFocus,
  parseView,
  phoneTabs,
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
    expect(selectionEnabled('country')).toBe(FEATURES.gasStorage || FEATURES.fuelOrigins);
    expect(selectionEnabled('region')).toBe(FEATURES.fuelOrigins);
    // A country was `storage/<code>` before M10; old links open the country page.
    expect(parseSelection('storage/de')).toEqual(FEATURES.gasStorage ? { kind: 'country', id: 'de' } : null);
    expect(parseSelection('country/de')).toEqual(FEATURES.gasStorage ? { kind: 'country', id: 'de' } : null);
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
    expect(shown(visibleLayers('origins', null, all))).toEqual(['storage', 'terminals', 'chokepoints']);
  });

  it('adds the layer of the open item, so a chokepoint opened from a pipeline still shows', () => {
    expect(shown(visibleLayers('pipelines', { kind: 'chokepoint' }, all))).toEqual(['pipelines', 'chokepoints']);
    expect(shown(visibleLayers(null, { kind: 'basin' }, { ...all, basins: false }))).toContain('basins');
  });

  it('a basin brings its pipelines, even on the basins surface', () => {
    expect(shown(visibleLayers('basins', { kind: 'basin' }, all))).toEqual(['basins', 'pipelines']);
    expect(shown(visibleLayers(null, { kind: 'basin' }, { ...all, pipelines: false }))).toContain('pipelines');
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

describe('the storage and oil origins views on the map', () => {
  it('fade every asset for storage, and frame the countries each covers', () => {
    const lit = viewHighlight('storage', data);
    expect(lit.pipelines.size + lit.chokepoints.size + lit.lng.size + lit.terminals.size).toBe(0);
    expect(viewPoints('storage', data)).toEqual(STORAGE_BOUNDS);
    expect(viewPoints('origins', data)).toEqual(WORLD_BOUNDS);
  });

  it('keep nothing bright for oil origins without import data', () => {
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

describe('phone tab bar', () => {
  it('fits every section while Home and the sections take five slots or fewer', () => {
    expect(phoneTabs(['chokepoints', 'pipelines', 'terminals', 'basins'])).toEqual({
      bar: ['chokepoints', 'pipelines', 'terminals', 'basins'],
      more: [],
    });
  });

  it('keeps the live sections in the bar and moves the rest under More, in rail order', () => {
    expect(phoneTabs(['chokepoints', 'pipelines', 'terminals', 'basins', 'storage', 'origins'])).toEqual({
      bar: ['chokepoints', 'pipelines', 'terminals'],
      more: ['basins', 'storage', 'origins'],
    });
    // The bar keeps rail order; a missing live section leaves its slot to the next one.
    expect(phoneTabs(['pipelines', 'basins', 'storage', 'origins', 'terminals'])).toEqual({
      bar: ['pipelines', 'basins', 'terminals'],
      more: ['storage', 'origins'],
    });
  });
});

describe('basinPipelineFocus', () => {
  const data: Datasets = { ...EMPTY_DATASETS, chokepoints: [chokepoint('hormuz', [56, 26])], pipelines: [pipeline()] };
  const touching = new Set(['a', 'b']);
  const surface = viewHighlight('basins', data);

  it('on the basins surface, draws no pipelines until a basin is open', () => {
    expect(basinPipelineFocus('basins', null, null, surface, false, data)!.only).toEqual(new Set());
  });

  it("then only the focused basin's, bright, and still while one of them is open", () => {
    const focus = basinPipelineFocus('basins', touching, null, surface, false, data)!;
    expect(focus.only).toEqual(touching);
    expect(focus.highlight).toEqual({ ...surface, pipelines: touching });
    expect(basinPipelineFocus('basins', touching, 'a', surface, false, data)!.only).toEqual(touching);
  });

  it('a pipeline opened there without a basin shows alone', () => {
    expect(basinPipelineFocus('basins', null, 'x', surface, false, data)!.only).toEqual(new Set(['x']));
  });

  it('elsewhere, does nothing without an open basin', () => {
    expect(basinPipelineFocus(null, null, null, null, false, data)).toBeNull();
    expect(basinPipelineFocus('pipelines', null, 'x', null, false, data)).toBeNull();
  });

  it('on Home, draws every pipeline, fades the rest and leaves the other kinds bright', () => {
    const focus = basinPipelineFocus(null, touching, null, null, false, data)!;
    expect(focus.only).toBeNull();
    expect(focus.highlight!.pipelines).toBe(touching);
    expect([...focus.highlight!.chokepoints]).toEqual(['hormuz']);
  });

  it('a quick filter keeps deciding what stays bright', () => {
    const filter = { pipelines: new Set(['b']), chokepoints: new Set<string>(), lng: new Set<string>(), terminals: new Set<string>() };
    expect(basinPipelineFocus(null, touching, null, filter, true, data)!.highlight).toBe(filter);
    expect(basinPipelineFocus('basins', touching, null, filter, true, data)!.highlight).toBe(filter);
  });
});
