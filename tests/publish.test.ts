import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { failureMeta, publishDataset, validateRecords } from '../jobs/lib/output';
import { dataThrough, toTransitSeries } from '../jobs/lib/portwatch';

const schema = z.object({ id: z.string(), value: z.number() });
const meta = { sourceUrl: 'https://example.org', license: 'test' };
const clock = (iso: string) => () => new Date(iso);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'et-publish-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const read = async (path: string) => JSON.parse(await readFile(join(dir, path), 'utf8'));

describe('publishDataset', () => {
  it('writes data and meta on success', async () => {
    const result = await publishDataset({
      id: 'demo',
      schema,
      dataDir: dir,
      now: clock('2026-10-28T12:00:00Z'),
      produce: async () => ({ records: [{ id: 'a', value: 1 }], meta }),
    });
    expect(result.ok).toBe(true);
    expect(await read('demo.json')).toEqual([{ id: 'a', value: 1 }]);
    expect(await read('meta/demo.json')).toMatchObject({
      fetchedAt: '2026-10-28T12:00:00.000Z',
      recordCount: 1,
      lastAttempt: { ok: true },
    });
  });

  it.each([
    ['a fetch error', async () => Promise.reject(new Error('network down'))],
    ['an empty result', async () => ({ records: [], meta })],
    ['an invalid record', async () => ({ records: [{ id: 'a', value: 'NaN' }], meta })],
  ])('keeps the last good file after %s and records the failure', async (_label, produce) => {
    await publishDataset({
      id: 'demo',
      schema,
      dataDir: dir,
      now: clock('2026-10-28T12:00:00Z'),
      produce: async () => ({ records: [{ id: 'a', value: 1 }], meta }),
    });
    const result = await publishDataset({ id: 'demo', schema, dataDir: dir, now: clock('2026-10-28T18:00:00Z'), produce });

    expect(result.ok).toBe(false);
    expect(await read('demo.json')).toEqual([{ id: 'a', value: 1 }]);
    const after = await read('meta/demo.json');
    expect(after.fetchedAt).toBe('2026-10-28T12:00:00.000Z');
    expect(after.recordCount).toBe(1);
    expect(after.lastAttempt).toMatchObject({ at: '2026-10-28T18:00:00.000Z', ok: false });
    expect(after.lastAttempt.error).toBeTruthy();
  });

  it('writes nothing when the very first run fails', async () => {
    const result = await publishDataset({ id: 'demo', schema, dataDir: dir, produce: async () => Promise.reject(new Error('x')) });
    expect(result.ok).toBe(false);
    await expect(readFile(join(dir, 'demo.json'))).rejects.toThrow();
    await expect(readFile(join(dir, 'meta/demo.json'))).rejects.toThrow();
  });
});

describe('validateRecords and failureMeta', () => {
  it('rejects non-arrays and empties', () => {
    expect(() => validateRecords('x', null, schema)).toThrow(/no records/);
    expect(() => validateRecords('x', [], schema)).toThrow(/no records/);
  });

  it('truncates long errors and needs a previous meta', () => {
    expect(failureMeta(null, 'e', 't')).toBeNull();
    const prev = { id: 'x', fetchedAt: 'f', recordCount: 1, sourceUrl: 'u', license: 'l' };
    expect(failureMeta(prev, 'e'.repeat(500), 't')?.lastAttempt?.error).toHaveLength(300);
  });
});

describe('toTransitSeries', () => {
  const opts = { today: '2026-10-28', keepDays: 400, minPoints: 3, maxLagDays: 21 };
  const row = (date: string, n: number, portid = 'chokepoint6') => ({ date, portid, n_tanker: n });

  it('sorts, dedupes by date, trims old days and ignores other chokepoints', () => {
    const series = toTransitSeries(
      'chokepoint6',
      [row('2026-10-25', 3), row('2026-10-23', 1), row('2026-10-24', 2), row('2026-10-24', 5), row('2024-01-01', 9), row('2026-10-25', 7, 'chokepoint1')],
      opts,
    );
    expect(series).toEqual({
      id: 'portwatch-chokepoint6',
      metric: 'tanker_transits',
      unit: 'tankers/day',
      points: [
        { date: '2026-10-23', value: 1 },
        { date: '2026-10-24', value: 5 },
        { date: '2026-10-25', value: 3 },
      ],
    });
  });

  it('fails on too few days or a stalled feed', () => {
    expect(() => toTransitSeries('chokepoint6', [row('2026-10-25', 1)], opts)).toThrow(/only 1 days/);
    const stale = [row('2026-09-01', 1), row('2026-09-02', 1), row('2026-09-03', 1)];
    expect(() => toTransitSeries('chokepoint6', stale, opts)).toThrow(/days old/);
  });

  it('reports data through the earliest latest point', () => {
    const s = (last: string) => ({ id: last, metric: 'tanker_transits' as const, unit: 'x', points: [{ date: last, value: 1 }] });
    expect(dataThrough([s('2026-10-25'), s('2026-10-24')])).toBe('2026-10-24');
  });
});
