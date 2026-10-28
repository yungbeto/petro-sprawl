import { describe, expect, it } from 'vitest';
import { datasetFreshness, formatAge, formatUtcClock, overallFreshness, sortFreshness } from '../src/lib/freshness';
import type { DatasetMeta } from '../src/types';

const now = new Date('2026-10-28T18:00:00Z');
const meta = (id: string, fetchedAt: string, extra: Partial<DatasetMeta> = {}): DatasetMeta => ({
  id,
  fetchedAt,
  recordCount: 1,
  sourceUrl: 'u',
  license: 'l',
  ...extra,
});

describe('formatAge', () => {
  it('rounds down to the largest whole unit', () => {
    expect(formatAge('2026-10-28T17:59:30Z', now)).toBe('just now');
    expect(formatAge('2026-10-28T17:48:00Z', now)).toBe('12 min ago');
    expect(formatAge('2026-10-28T14:02:00Z', now)).toBe('3 h ago');
    expect(formatAge('2026-10-26T12:00:00Z', now)).toBe('2 d ago');
  });

  it('treats future timestamps as just now', () => {
    expect(formatAge('2026-10-28T19:00:00Z', now)).toBe('just now');
  });
});

describe('formatUtcClock', () => {
  it('shows HH:MM UTC', () => {
    expect(formatUtcClock('2026-10-28T14:02:11.000Z')).toBe('14:02 UTC');
  });
});

describe('datasetFreshness', () => {
  it('marks scheduled data stale only past its cadence', () => {
    expect(datasetFreshness(meta('chokepoint-transits', '2026-10-28T06:00:00Z'), now).stale).toBe(false);
    expect(datasetFreshness(meta('chokepoint-transits', '2026-10-27T18:00:00Z'), now).stale).toBe(true);
  });

  it('never marks manual imports stale by age', () => {
    expect(datasetFreshness(meta('basins', '2025-01-01T00:00:00Z'), now).stale).toBe(false);
  });

  it('reports a failed last attempt while keeping the good fetch time', () => {
    const f = datasetFreshness(
      meta('chokepoint-transits', '2026-10-28T12:00:00Z', {
        lastAttempt: { at: '2026-10-28T17:00:00Z', ok: false, error: 'x' },
      }),
      now,
    );
    expect(f).toMatchObject({ fetchedAt: '2026-10-28T12:00:00Z', failedAt: '2026-10-28T17:00:00Z' });
  });
});

describe('overallFreshness', () => {
  it('uses the oldest scheduled dataset, else the newest import', () => {
    const items = [
      datasetFreshness(meta('basins', '2026-10-28T10:00:00Z'), now),
      datasetFreshness(meta('chokepoint-transits', '2026-10-28T12:00:00Z'), now),
    ];
    expect(overallFreshness(items)?.id).toBe('chokepoint-transits');
    expect(overallFreshness(items.slice(0, 1))?.id).toBe('basins');
    expect(overallFreshness([])).toBeNull();
  });

  it('sorts scheduled datasets first', () => {
    const items = [datasetFreshness(meta('basins', 'x'), now), datasetFreshness(meta('chokepoint-transits', 'x'), now)];
    expect(sortFreshness(items).map((f) => f.id)).toEqual(['chokepoint-transits', 'basins']);
  });
});
