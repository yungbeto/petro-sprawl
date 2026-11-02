import { describe, expect, it } from 'vitest';
import { addDays, chokepointFlow, flowBand, flowIndex, trailingMeans, windowEndingOn, windowMean } from '../src/lib/flow';
import type { ObservationSeries } from '../src/types';

const days = (end: string, n: number, value: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(end, -(n - 1 - i)), value: value(i) }));

describe('windows', () => {
  const points = days('2026-10-25', 10, (i) => i + 1); // 1..10, ending 2026-10-25

  it('averages points inside an inclusive window', () => {
    expect(windowMean(points, '2026-10-24', '2026-10-25', 1)?.mean).toBe(9.5);
    expect(windowEndingOn(points, '2026-10-25', 7, 1)).toMatchObject({ mean: 7, count: 7, from: '2026-10-19' });
  });

  it('returns null when too few points fall inside', () => {
    expect(windowEndingOn(points, '2026-10-25', 7, 8)).toBeNull();
    expect(windowMean([], '2026-01-01', '2026-12-31', 0)).toBeNull();
  });

  it('counts missing days as missing, not zero', () => {
    const gappy = points.filter((_, i) => i % 2 === 0); // 1,3,5,7,9
    expect(windowEndingOn(gappy, '2026-10-25', 10, 1)?.mean).toBe(5);
  });
});

describe('flowIndex and flowBand', () => {
  it('divides recent by baseline', () => {
    expect(flowIndex(5, 10)).toBe(0.5);
    expect(flowIndex(10, 10)).toBe(1);
  });

  it('is null without a usable baseline', () => {
    expect(flowIndex(5, 0)).toBeNull();
    expect(flowIndex(null, 10)).toBeNull();
    expect(flowIndex(5, undefined)).toBeNull();
  });

  it('bands at 0.85 and 1.15, with the edges counted as near', () => {
    expect(flowBand(0.84)).toBe('below');
    expect(flowBand(0.85)).toBe('near');
    expect(flowBand(1.15)).toBe('near');
    expect(flowBand(1.16)).toBe('above');
    expect(flowBand(null)).toBeNull();
  });
});

describe('chokepointFlow', () => {
  // A year at 40/day, then the last 30 days at 2/day: a sudden disruption.
  const points = days('2026-10-25', 400, (i) => (i >= 370 ? 2 : 40));
  const series: ObservationSeries = {
    id: 's',
    metric: 'tanker_transits',
    unit: 'tankers/day',
    points,
    fiveYear: { mean: 50, from: '2020-10-26', to: '2025-10-25', count: 1825 },
  };

  it('compares the last 7 days with both baselines, ending on the latest point', () => {
    const flow = chokepointFlow(series)!;
    expect(flow.latestDate).toBe('2026-10-25');
    expect(flow.recent?.mean).toBe(2);
    expect(flow.trailing?.mean).toBeCloseTo((335 * 40 + 30 * 2) / 365);
    expect(flow.indexFiveYear).toBe(2 / 50);
    expect(flow.indexTrailing).toBeCloseTo(2 / ((335 * 40 + 30 * 2) / 365));
    expect(flow.band).toBe('below');
    expect(flow.sparkline).toHaveLength(90);
    expect(flow.sparkline.at(-1)?.date).toBe('2026-10-25');
    // The trend is the 7-day mean: it ends on the index's own figure and steps down over a week.
    expect(flow.trend.map((p) => p.date)).toEqual(flow.sparkline.map((p) => p.date));
    expect(flow.trend.at(-1)?.value).toBe(2);
    expect(flow.trend.find((p) => p.date === addDays('2026-10-25', -29))?.value).toBeCloseTo((6 * 40 + 2) / 7);
  });

  it('a trailing mean uses the days the series has, and starts where asked', () => {
    const gappy = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-01-05', value: 30 },
      { date: '2026-01-10', value: 40 },
    ];
    expect(trailingMeans(gappy, 7, '2026-01-02').map((p) => p.value)).toEqual([15, 20, 35]);
  });

  it('bands by the trailing year when there is no five-year baseline', () => {
    const flow = chokepointFlow({ ...series, fiveYear: undefined, points: days('2026-10-25', 400, () => 10) })!;
    expect(flow.indexFiveYear).toBeNull();
    expect(flow.indexTrailing).toBe(1);
    expect(flow.band).toBe('near');
  });

  it('is null without data', () => {
    expect(chokepointFlow(undefined)).toBeNull();
    expect(chokepointFlow({ ...series, points: [] })).toBeNull();
  });
});
