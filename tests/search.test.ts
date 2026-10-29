import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { buildSearchIndex, matchScore, normalize, search } from '../src/lib/search';
import { basin, chokepoint, lngTerminal, pipeline } from './fixtures';

const data: Datasets = {
  ...EMPTY_DATASETS,
  chokepoints: [{ ...chokepoint('hormuz', [56, 26]), name: 'Strait of Hormuz' }],
  pipelines: [
    pipeline({ id: 'nord-stream-1', name: 'Nord Stream 1', aliases: ['Nord Stream'], sources: ['curated'] }),
    pipeline({ id: 'gem-p1', name: 'Nordic Gas Grid · segment 2', sources: ['gem'] }),
    pipeline({
      id: 'urengoy-pomary-uzhhorod',
      name: 'Urengoy–Pomary–Uzhhorod (Brotherhood)',
      aliases: ['Bratstvo'],
      fromCountry: 'RU',
      transitCountries: ['UA'],
      toCountry: 'SK',
      sources: ['curated'],
    }),
  ],
  countries: [{ id: 'DE', name: 'Germany', geometry: basin.geometry }],
  series: [{ id: 'agsi-de', metric: 'storage_fill_pct', unit: '%', points: [] }],
  basins: [{ ...basin, name: 'Zagros Fold Belt' }],
  lngTerminals: [lngTerminal({ id: 'gem-t1-export', name: 'QatarEnergy LNG (N)', aliases: ['Ras Laffan'] })],
};

const index = buildSearchIndex(data);
const ids = (query: string) => search(index, query).map((e) => `${e.selection.kind}/${e.selection.id}`);

describe('search', () => {
  it('normalizes case, diacritics and punctuation', () => {
    expect(normalize('  Urengoy–Pomary (Brotherhood) ')).toBe('urengoy pomary brotherhood');
    expect(normalize('Velké Kapušany')).toBe('velke kapusany');
  });

  it('scores exact, prefix, word prefix and substring matches', () => {
    const terms = ['nord stream 1', 'nord stream'];
    expect(matchScore(terms, 'nord stream')).toBe(0);
    expect(matchScore(terms, 'nord')).toBe(1);
    expect(matchScore(terms, 'stream')).toBe(2);
    expect(matchScore(terms, 'ream')).toBe(3);
    expect(matchScore(terms, 'stream nord')).toBe(2);
    expect(matchScore(terms, 'turk')).toBeNull();
  });

  it('finds every kind and ranks curated pipelines above GEM rows', () => {
    expect(ids('nord')).toEqual(['pipeline/nord-stream-1', 'pipeline/gem-p1']);
    expect(ids('hormuz')).toEqual(['chokepoint/hormuz']);
    expect(ids('zagros')).toEqual(['basin/usgs-1']);
    expect(ids('bratstvo')).toEqual(['pipeline/urengoy-pomary-uzhhorod']);
    expect(ids('ger')).toEqual(['storage/de']);
    expect(ids('ras laffan')).toEqual(['lng/gem-t1-export']);
    expect(ids('')).toEqual([]);
  });

  it('describes each result', () => {
    const byId = new Map(index.map((e) => [e.selection.id, e.detail]));
    expect(byId.get('urengoy-pomary-uzhhorod')).toBe('Gas pipeline · RU → UA → SK');
    expect(byId.get('de')).toBe('Country · gas storage');
    expect(byId.get('gem-t1-export')).toBe('LNG export terminal · QA');
  });

  it('caps the result count', () => {
    expect(search(index, 'a', 2)).toHaveLength(2);
  });
});
