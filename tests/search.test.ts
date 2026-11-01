import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/lib/config';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { buildSearchIndex, groupResults, matchScore, normalize, search, type SearchEntry } from '../src/lib/search';
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
  series: [{ id: 'agsi-de', metric: 'storage_fill_pct', unit: '%', points: [{ date: '2026-10-27', value: 81 }] }],
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
    // A country opens gas storage, so it's only searchable while that surface is on.
    expect(ids('ger')).toEqual(FEATURES.gasStorage ? ['country/de'] : []);
    expect(ids('ras laffan')).toEqual(['lng/gem-t1-export']);
    expect(ids('')).toEqual([]);
  });

  it('describes each result', () => {
    const byId = new Map(index.map((e) => [e.selection.id, e.detail]));
    expect(byId.get('urengoy-pomary-uzhhorod')).toBe('Gas pipeline · RU → UA → SK');
    expect(byId.get('de')).toBe(FEATURES.gasStorage ? 'Country · gas storage' : undefined);
    expect(byId.get('gem-t1-export')).toBe('LNG export terminal · QA');
  });

  it('caps the result count', () => {
    expect(search(index, 'a', 2)).toHaveLength(2);
  });
});

describe('groupResults', () => {
  const e = (kind: SearchEntry['selection']['kind'], id: string): SearchEntry => ({
    selection: { kind, id },
    name: id,
    detail: '',
    terms: [id],
    priority: 0,
  });
  const ranked = [e('pipeline', 'p1'), e('chokepoint', 'c1'), e('pipeline', 'p2'), e('lng', 'l1'), e('pipeline', 'p3'), e('terminal', 't1')];

  it('groups by kind in the order of the best match of each kind, a few of each', () => {
    const groups = groupResults(ranked, 'all', { perGroup: 2 });
    expect(groups.map((g) => g.label)).toEqual(['Pipelines', 'Chokepoints', 'LNG terminals', 'Oil terminals']);
    expect(groups[0]!.entries.map((x) => x.selection.id)).toEqual(['p1', 'p2']);
  });

  it('narrows to one scope, which can span kinds, and keeps more of it', () => {
    const groups = groupResults(ranked, 'terminals', { perGroup: 1, scopedLimit: 10 });
    expect(groups.map((g) => g.kind)).toEqual(['lng', 'terminal']);
    expect(groupResults(ranked, 'pipelines', { perGroup: 1, scopedLimit: 2 })[0]!.entries).toHaveLength(2);
    expect(groupResults(ranked, 'basins')).toEqual([]);
  });
});
