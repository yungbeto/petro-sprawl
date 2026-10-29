import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { filterMatches, filterRows, matchCount, parseFilter } from '../src/lib/filters';
import type { Evidence } from '../src/types';
import { chokepoint, lngTerminal, pipeline } from './fixtures';

const claim = (status: Evidence['status'], observedAt: string, sourceType: Evidence['sourceType'] = 'press'): Evidence => ({
  status,
  sourceType,
  observedAt,
  recordedAt: observedAt,
});

const now = new Date('2026-10-28T12:00:00Z');

const data: Datasets = {
  ...EMPTY_DATASETS,
  chokepoints: [chokepoint('hormuz', [56, 26]), chokepoint('suez', [32, 30])],
  pipelines: [
    pipeline({ id: 'ns1', name: 'Nord Stream 1', sources: ['curated'], evidence: [claim('offline', '2026-10-14')] }),
    pipeline({ id: 'gem-a', name: 'A line', sources: ['gem'], evidence: [claim('idle', '2023-01-01', 'dataset')] }),
    pipeline({ id: 'old', name: 'Old claim', sources: ['curated'], evidence: [claim('operating', '2026-04-01')] }),
    pipeline({
      id: 'met',
      name: 'Metered',
      commodity: 'gas',
      sources: ['curated'],
      evidence: [claim('operating', '2026-10-27', 'measured'), claim('operating', '2025-01-01')],
    }),
    pipeline({ id: 'crude', name: 'Crude line', commodity: 'oil', sources: ['gem'], evidence: [claim('operating', '2024-01-01', 'dataset')] }),
  ],
  lngTerminals: [
    lngTerminal({ id: 'ras-laffan', name: 'Ras Laffan' }),
    lngTerminal({
      id: 'gate',
      name: 'Gate',
      facility: 'import',
      evidence: [{ status: 'operating', sourceType: 'measured', observedAt: '2026-10-27', recordedAt: '2026-10-27' }],
    }),
    lngTerminal({ id: 'mothballed', name: 'Mothballed LNG', facility: 'import', evidence: [claim('idle', '2025-01-01', 'dataset')] }),
  ],
};

describe('quick filters', () => {
  it('parses only known filter ids', () => {
    expect(parseFilter('gas')).toBe('gas');
    expect(parseFilter('GAS')).toBeNull();
    expect(parseFilter(null)).toBeNull();
  });

  it('matches offline and idle pipelines and LNG terminals', () => {
    const offline = filterMatches('offline', data, now);
    expect([...offline.pipelines].sort()).toEqual(['gem-a', 'ns1']);
    expect([...offline.lng]).toEqual(['mothballed']);
  });

  it('matches unverified corridor claims, not metered ones or dataset rows', () => {
    expect([...filterMatches('unverified', data, now).pipelines]).toEqual(['old']);
  });

  it('matches metered pipelines and commodities; oil includes the chokepoints', () => {
    expect([...filterMatches('metered', data, now).pipelines]).toEqual(['met']);
    expect([...filterMatches('metered', data, now).lng]).toEqual(['gate']);
    const oil = filterMatches('oil', data, now);
    expect([...oil.pipelines]).toEqual(['crude']);
    expect(oil.chokepoints.size).toBe(2);
    expect(matchCount(oil)).toBe(3);
    const gas = filterMatches('gas', data, now);
    expect(gas.chokepoints.size).toBe(0);
    expect([...gas.lng]).toEqual(['ras-laffan', 'gate', 'mothballed']);
    expect(oil.lng.size).toBe(0);
  });

  it('lists chokepoints first, then corridor pipelines, then the rest, then LNG terminals', () => {
    const rows = filterRows(
      { pipelines: new Set(['gem-a', 'ns1']), chokepoints: new Set(['suez']), lng: new Set(['ras-laffan']), terminals: new Set() },
      data,
    );
    expect(rows.map((r) => r.selection.id)).toEqual(['suez', 'ns1', 'gem-a', 'ras-laffan']);
    expect(rows.at(-1)?.selection.kind).toBe('lng');
  });
});
