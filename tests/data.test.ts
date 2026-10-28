import { describe, expect, it } from 'vitest';
import { chokepointsInBasin, pipelinesTouchingBasin, resolveSelection, EMPTY_DATASETS } from '../src/lib/data';
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
