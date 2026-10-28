import { describe, expect, it } from 'vitest';
import { toStorageSeries } from '../jobs/lib/agsi';
import { mixColors } from '../src/lib/color';
import { storageFills, storageSummary } from '../src/lib/gasStorage';
import type { ObservationSeries } from '../src/types';

const opts = { today: '2026-10-28', keepDays: 400, maxLagDays: 7 };

describe('AGSI+ transform', () => {
  it('parses string fills, skips missing values and no-data rows', () => {
    const s = toStorageSeries(
      'agsi-de',
      'Germany',
      [
        { gasDayStart: '2026-10-26', full: '81.25', status: 'C' },
        { gasDayStart: '2026-10-25', full: '-', status: 'C' },
        { gasDayStart: '2026-10-24', full: '0', status: 'N' },
        { gasDayStart: '2026-10-27', full: 81.5, status: 'E' },
      ],
      opts,
    );
    expect(s).toMatchObject({ id: 'agsi-de', metric: 'storage_fill_pct', unit: '%', label: 'Germany' });
    expect(s?.points).toEqual([
      { date: '2026-10-26', value: 81.25 },
      { date: '2026-10-27', value: 81.5 },
    ]);
  });

  it('returns null for a country with nothing usable and throws on stalled data', () => {
    expect(toStorageSeries('agsi-xx', 'X', [{ gasDayStart: '2026-10-27', full: '-' }], opts)).toBeNull();
    expect(() => toStorageSeries('agsi-de', 'Germany', [{ gasDayStart: '2026-10-01', full: '50' }], opts)).toThrow(/days old/);
  });
});

const series = (points: [string, number][]): ObservationSeries => ({
  id: 'agsi-de',
  metric: 'storage_fill_pct',
  unit: '%',
  points: points.map(([date, value]) => ({ date, value })),
});

describe('storageSummary', () => {
  it('gives the latest fill, the 7-day change and the same date last year', () => {
    const summary = storageSummary(
      series([
        ['2025-10-26', 90],
        ['2026-10-20', 80],
        ['2026-10-27', 82.5],
      ]),
    );
    expect(summary).toMatchObject({
      latestDate: '2026-10-27',
      fill: 82.5,
      change7d: 2.5,
      lastYear: { date: '2025-10-26', fill: 90 },
    });
    expect(summary?.year.map((p) => p.date)).toEqual(['2026-10-20', '2026-10-27']);
  });

  it('leaves comparisons out when there is nothing to compare with', () => {
    expect(storageSummary(series([['2026-10-27', 82.5]]))).toMatchObject({ change7d: null, lastYear: null });
    expect(storageSummary(undefined)).toBeNull();
  });

  it('maps latest fills to countries with a series', () => {
    expect(storageFills([series([['2026-10-27', 82.5]])], [{ id: 'DE' }, { id: 'FR' }])).toEqual(new Map([['DE', 82.5]]));
  });
});

describe('mixColors', () => {
  it('interpolates and clamps', () => {
    expect(mixColors([0, 0, 0, 0], [200, 100, 50, 255], 0.5)).toEqual([100, 50, 25, 128]);
    expect(mixColors([0, 0, 0, 0], [200, 100, 50, 255], 2)).toEqual([200, 100, 50, 255]);
  });
});
