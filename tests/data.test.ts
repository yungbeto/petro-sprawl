import { describe, expect, it } from 'vitest';
import { chokepointsInBasin, pipelinesTouchingBasin, resolveSelection, EMPTY_DATASETS, systemSections } from '../src/lib/data';
import { basin, chokepoint, pipeline } from './fixtures';

const data = {
  ...EMPTY_DATASETS,
  basins: [basin],
  chokepoints: [chokepoint('hormuz', [5, 5]), chokepoint('suez', [50, 50])],
  pipelines: [pipeline()],
};

describe('resolveSelection', () => {
  it('finds items by kind and id', () => {
    expect(resolveSelection({ kind: 'basin', id: 'usgs-1' }, data)?.item).toBe(basin);
    expect(resolveSelection({ kind: 'chokepoint', id: 'suez' }, data)?.kind).toBe('chokepoint');
    expect(resolveSelection({ kind: 'pipeline', id: 'test-line' }, data)?.kind).toBe('pipeline');
  });

  it('returns null for missing items and no selection', () => {
    expect(resolveSelection(null, data)).toBeNull();
    expect(resolveSelection({ kind: 'basin', id: 'usgs-2' }, data)).toBeNull();
    expect(resolveSelection({ kind: 'storage', id: 'de' }, data)).toBeNull();
  });
});

describe('basin relations', () => {
  it('lists chokepoints inside and pipelines crossing', () => {
    expect(chokepointsInBasin(basin, data.chokepoints).map((c) => c.id)).toEqual(['hormuz']);
    expect(pipelinesTouchingBasin(basin, data.pipelines).map((p) => p.id)).toEqual(['test-line']);
  });
});

import { disruptionsFor } from '../src/lib/data';

describe('disruptionsFor', () => {
  it('filters by asset and sorts newest first', () => {
    const d = (id: string, assetId: string, startedAt: string) => ({
      id,
      assetKind: 'chokepoint' as const,
      assetId,
      startedAt,
      cause: 'conflict' as const,
      summary: '',
      sources: [],
      recordedAt: '2026-10-28',
    });
    const withDisruptions = { ...data, disruptions: [d('a', 'hormuz', '2024-01'), d('b', 'hormuz', '2026-03'), d('c', 'suez', '2026-01')] };
    expect(disruptionsFor(withDisruptions, 'chokepoint', 'hormuz').map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('systemSections', () => {
  it('lists the other sections of the same system, and nothing for a standalone line', () => {
    const a = pipeline({ id: 'a', system: 'Arab Gas Pipeline' });
    const b = pipeline({ id: 'b', system: 'Arab Gas Pipeline' });
    const c = pipeline({ id: 'c', system: 'Druzhba Oil Pipeline' });
    expect(systemSections(a, [a, b, c]).map((p) => p.id)).toEqual(['b']);
    expect(systemSections(pipeline({ id: 'd' }), [a, b, c])).toEqual([]);
  });
});

import { portCallsFor } from '../src/lib/data';

describe('portCallsFor', () => {
  const points = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 4 }));
  const withSeries = {
    ...EMPTY_DATASETS,
    series: [{ id: 'portwatch-port162', metric: 'tanker_port_calls' as const, unit: 'tankers/day', points }],
  };
  const ports = [
    { portwatchId: 'port362', name: 'Fujairah', pipelineIds: ['habshan-fujairah'] },
    { portwatchId: 'port162', name: 'Ceyhan', pipelineIds: ['kirkuk-ceyhan', 'btc'] },
  ];

  it('finds the loaded port series for a pipeline', () => {
    expect(portCallsFor(withSeries, 'btc', ports).map((c) => [c.port, c.flow.latestDate])).toEqual([['Ceyhan', '2026-10-30']]);
    expect(portCallsFor(withSeries, 'kirkuk-ceyhan', ports)).toHaveLength(1);
    // No export series loaded: the calls still show.
    expect(portCallsFor(withSeries, 'btc', ports)[0]?.exports).toBeNull();
    const withExports = {
      ...withSeries,
      series: [...withSeries.series, { id: 'portwatch-port162-exports', metric: 'tanker_exports_t' as const, unit: 't/day', points }],
    };
    expect(portCallsFor(withExports, 'btc', ports)[0]?.exports?.recent?.mean).toBe(4);
  });

  it('is empty for pipelines without a port or before the series loads', () => {
    expect(portCallsFor(withSeries, 'habshan-fujairah', ports)).toEqual([]);
    expect(portCallsFor(withSeries, 'turkstream', ports)).toEqual([]);
  });
});
