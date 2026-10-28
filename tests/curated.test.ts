import { describe, expect, it } from 'vitest';
import {
  matchGemRows,
  mergeCurated,
  mergePipelines,
  nameSimilarity,
  nameTokens,
  type CuratedPipeline,
} from '../jobs/lib/curated-pipelines';
import type { Evidence } from '../src/types';
import { pipeline } from './fixtures';

const claim = (observedAt: string, status: Evidence['status'] = 'offline'): Evidence => ({
  status,
  sourceType: 'press',
  statement: `claim ${observedAt}`,
  url: 'https://example.org/a',
  observedAt,
  recordedAt: '2026-10-28',
});

const gemClaim = (observedAt: string): Evidence => ({
  status: 'idle',
  sourceType: 'dataset',
  statement: 'GEM status: mothballed',
  observedAt,
  recordedAt: '2026-10-28',
});

const curated = (overrides: Partial<CuratedPipeline> = {}): CuratedPipeline => ({
  id: 'nord-stream-1',
  name: 'Nord Stream 1',
  aliases: ['Nord Stream'],
  commodity: 'gas',
  fromCountry: 'RU',
  toCountry: 'DE',
  transitCountries: [],
  gem: [],
  evidence: [claim('2023-03-06')],
  ...overrides,
});

describe('name matching', () => {
  it('drops pipeline words and the GEM segment suffix', () => {
    expect(nameTokens('TurkStream Gas Pipeline · 1')).toEqual(['turkstream']);
    expect(nameTokens('Urengoy–Pomary–Uzhhorod (Brotherhood)')).toEqual(['urengoy', 'pomary', 'uzhhorod', 'brotherhood']);
  });

  it('requires numbers to agree', () => {
    expect(nameSimilarity('Nord Stream', 'Nord Stream Gas Pipeline')).toBe(1);
    expect(nameSimilarity('Nord Stream', 'Nord Stream 2 Gas Pipeline')).toBe(0);
    expect(nameSimilarity('Europipe I', 'Europipe II Gas Pipeline')).toBeLessThan(0.6);
  });
});

describe('matchGemRows', () => {
  const ns1 = pipeline({ id: 'gem-p0753', name: 'Nord Stream Gas Pipeline' });
  const ns2 = pipeline({ id: 'gem-p0752', name: 'Nord Stream 2 Gas Pipeline' });
  const elsewhere = pipeline({ id: 'gem-x', name: 'Nord Stream Gas Pipeline', toCountry: 'PL' });

  it('merges name matches on the route and reports ones that leave it', () => {
    const { matches, nearMisses } = matchGemRows(curated(), [ns1, ns2, elsewhere]);
    expect(matches.map((m) => [m.gemId, m.reason])).toEqual([['gem-p0753', 'name and countries']]);
    expect(nearMisses.map((m) => m.gemId)).toEqual(['gem-x']);
  });

  it('takes listed rows as they are, honours exclude, and can turn auto-matching off', () => {
    const listed = matchGemRows(curated({ gem: ['gem-p0752'], autoMatch: false }), [ns1, ns2]);
    expect(listed.matches.map((m) => m.gemId)).toEqual(['gem-p0752']);
    expect(matchGemRows(curated({ exclude: ['gem-p0753'] }), [ns1]).matches).toEqual([]);
  });

  it('ignores other commodities', () => {
    expect(matchGemRows(curated(), [pipeline({ id: 'o', name: 'Nord Stream', commodity: 'oil' })]).matches).toEqual([]);
  });
});

describe('mergeCurated', () => {
  const a = pipeline({
    id: 'gem-a',
    name: 'TurkStream Gas Pipeline · 1',
    capacity: { value: 15.75, unit: 'bcm/yr' },
    operator: 'South Stream Transport',
    evidence: [gemClaim('2023-08-11')],
    sources: ['gem-ggit'],
  });
  const b = pipeline({ id: 'gem-b', name: 'TurkStream Gas Pipeline · 2', geometryApprox: true, evidence: [gemClaim('2023-08-11')] });

  it('combines geometry, keeps curated fields, sorts evidence and drops repeated claims', () => {
    const merged = mergeCurated(curated({ id: 'turkstream', name: 'TurkStream', aliases: [] }), [a, b]);
    expect(merged.id).toBe('turkstream');
    expect(merged.geometry.type).toBe('MultiLineString');
    expect(merged.geometry.coordinates).toHaveLength(2);
    expect(merged.geometryApprox).toBe(false);
    expect(merged.evidence.map((e) => e.sourceType)).toEqual(['press', 'dataset']);
    expect(merged.aliases).toEqual(['TurkStream Gas Pipeline · 1', 'TurkStream Gas Pipeline · 2']);
    expect(merged.operator).toBe('South Stream Transport');
    expect(merged.capacity).toEqual({ value: 15.75, unit: 'bcm/yr' });
    expect(merged.sources).toEqual(['curated', 'gem-ggit']);
  });

  it('uses a cited curated capacity over GEM', () => {
    const source = { publisher: 'Interfax', title: 't', url: 'https://example.org/i', publishedAt: '2026-04-01' };
    const merged = mergeCurated(curated({ capacity: { value: 31.5, unit: 'bcm/yr', source } }), [a, b]);
    expect(merged.capacity).toEqual({ value: 31.5, unit: 'bcm/yr' });
    expect(merged.capacitySource).toEqual(source);
  });

  it('ranks cited claims above newer dataset claims', () => {
    const merged = mergeCurated(curated({ evidence: [claim('2022-09-27'), claim('2023-03-06')] }), [a]);
    expect(merged.evidence.map((e) => `${e.sourceType} ${e.observedAt}`)).toEqual([
      'press 2023-03-06',
      'press 2022-09-27',
      'dataset 2023-08-11',
    ]);
  });
});

describe('mergePipelines', () => {
  const gem = [
    pipeline({ id: 'gem-p0753', name: 'Nord Stream Gas Pipeline' }),
    pipeline({ id: 'gem-other', name: 'Other line' }),
  ];

  it('replaces matched rows, links flows, and reports missing or contested rows', () => {
    const { pipelines, report } = mergePipelines(
      [curated({ gem: ['gem-p0753', 'gem-nope'] }), curated({ id: 'dupe', gem: ['gem-p0753'] })],
      gem,
      new Map([['nord-stream-1', 'entsog-x']]),
    );
    expect(pipelines.map((p) => p.id).sort()).toEqual(['gem-other', 'nord-stream-1']);
    expect(pipelines.find((p) => p.id === 'nord-stream-1')?.flowSeriesId).toBe('entsog-x');
    expect(report.missing).toEqual([{ curatedId: 'nord-stream-1', gemId: 'gem-nope' }]);
    expect(report.conflicts).toEqual([{ gemId: 'gem-p0753', keptBy: 'nord-stream-1', alsoClaimedBy: 'dupe' }]);
  });
});
