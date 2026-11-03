import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { eachWithFallback, failureMeta, publishDataset, validateRecords } from '../jobs/lib/output';
import { addDays, dailyResponseSchema, dataThrough, dateWindows, toTransitSeries } from '../jobs/lib/portwatch';

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
  const row = (date: string, n: number, portid = 'chokepoint6') => ({ date, portid, values: { n_tanker: n } });
  /** One row per day for `days` days ending on `end`, all with value n. */
  const daily = (end: string, days: number, n: number) =>
    Array.from({ length: days }, (_, i) => row(addDays(end, -i), n));

  it('sorts, dedupes by date, trims to keepDays and ignores other chokepoints', () => {
    const history = daily('2025-10-01', 2400, 40);
    const series = toTransitSeries(
      'chokepoint6',
      [...history, row('2026-10-25', 3), row('2026-10-23', 1), row('2026-10-24', 2), row('2026-10-24', 5), row('2026-10-25', 7, 'chokepoint1')],
      { ...opts, keepDays: 10 },
    );
    expect(series.points).toEqual([
      { date: '2026-10-23', value: 1 },
      { date: '2026-10-24', value: 5 },
      { date: '2026-10-25', value: 3 },
    ]);
    expect(series.id).toBe('portwatch-chokepoint6');
  });

  it('builds port call and export series from one set of Daily_Ports_Data rows', () => {
    const page = dailyResponseSchema(['portcalls_tanker', 'export_tanker']).parse({
      features: daily('2026-10-25', 2400, 4).map((r) => ({
        attributes: { date: r.date, portid: 'port362', portcalls_tanker: 4, export_tanker: 61234.5 },
      })),
    });
    const rows = page.features.map((f) => f.attributes);
    const calls = toTransitSeries('port362', rows, { ...opts, metric: 'tanker_port_calls', field: 'portcalls_tanker', label: 'Fujairah' });
    expect(calls).toMatchObject({ id: 'portwatch-port362', metric: 'tanker_port_calls', label: 'Fujairah', unit: 'tankers/day' });
    expect(calls.points.at(-1)).toEqual({ date: '2026-10-25', value: 4 });
    expect(calls.fiveYear?.mean).toBe(4);
    const exports = toTransitSeries('port362', rows, {
      ...opts,
      metric: 'tanker_exports_t',
      field: 'export_tanker',
      unit: 't/day',
      id: 'portwatch-port362-exports',
    });
    expect(exports).toMatchObject({ id: 'portwatch-port362-exports', unit: 't/day' });
    expect(exports.fiveYear?.mean).toBeCloseTo(61234.5);
  });

  it('rejects rows missing a requested field or with a negative value', () => {
    const schema = dailyResponseSchema(['n_tanker', 'capacity_tanker']);
    expect(() => schema.parse({ features: [{ attributes: { date: '2026-10-25', portid: 'chokepoint6', n_tanker: 3 } }] })).toThrow();
    expect(() =>
      schema.parse({ features: [{ attributes: { date: '2026-10-25', portid: 'chokepoint6', n_tanker: 3, capacity_tanker: -1 } }] }),
    ).toThrow();
  });

  it('computes the five-year baseline from history before the trailing year', () => {
    // 40/day long ago, 2/day in the most recent year: the five-year mean ignores the recent year.
    const rows = [...daily('2025-10-25', 2200, 40), ...daily('2026-10-25', 365, 2)];
    const series = toTransitSeries('chokepoint6', rows, opts);
    expect(series.fiveYear).toMatchObject({ mean: 40, from: '2020-10-27', to: '2025-10-25' });
  });

  it('fails on too few days, a stalled feed, or missing history', () => {
    expect(() => toTransitSeries('chokepoint6', [row('2026-10-25', 1)], opts)).toThrow(/only 1 days/);
    expect(() => toTransitSeries('chokepoint6', daily('2026-09-01', 30, 1), opts)).toThrow(/days old/);
    expect(() => toTransitSeries('chokepoint6', daily('2026-10-25', 400, 1), opts)).toThrow(/five-year/);
  });

  it('reports data through the earliest latest point', () => {
    const s = (last: string) => ({ id: last, metric: 'tanker_transits' as const, unit: 'x', points: [{ date: last, value: 1 }] });
    expect(dataThrough([s('2026-10-25'), s('2026-10-24')])).toBe('2026-10-24');
  });
});

import { backoffMs, withCause } from '../jobs/lib/http';

describe('dateWindows', () => {
  it('covers the range with inclusive windows, the last one cut short', () => {
    expect(dateWindows('2026-01-01', '2026-01-10', 4)).toEqual([
      ['2026-01-01', '2026-01-04'],
      ['2026-01-05', '2026-01-08'],
      ['2026-01-09', '2026-01-10'],
    ]);
    expect(dateWindows('2026-01-01', '2026-01-04', 4)).toEqual([['2026-01-01', '2026-01-04']]);
  });
});

describe('backoffMs', () => {
  it('doubles from 4 s and stops at the cap', () => {
    expect([1, 2, 3, 4, 5].map((a) => backoffMs(a, 30_000))).toEqual([4_000, 8_000, 16_000, 30_000, 30_000]);
  });
});

describe('withCause', () => {
  it('names the network cause behind a bare fetch failure', () => {
    const err = new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    expect((withCause(err, 'ENTSOG') as Error).message).toBe('ENTSOG unreachable: UND_ERR_CONNECT_TIMEOUT');
    const other = new Error('ENTSOG responded 500');
    expect(withCause(other, 'ENTSOG')).toBe(other);
  });
});

import { fetchJson } from '../jobs/lib/http';

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries an error body and returns the next good answer', async () => {
    vi.useFakeTimers();
    const replies = [{ error: { code: 400 } }, { features: [] }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => replies.shift() })));
    const pending = fetchJson('https://example.org', { source: 'X', bodyError: (b) => ((b as { error?: unknown }).error ? 'bad' : null) });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ features: [] });
  });

  it('stops retrying at the deadline instead of waiting past it', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal('fetch', fetch);
    // Six attempts would wait 4 + 8 + 16 + 30 + 30 s; a 10 s deadline leaves room for the first wait only.
    const pending = fetchJson('https://example.org', { source: 'X', attempts: 6, deadline: Date.now() + 10_000 });
    const settled = expect(pending).rejects.toThrow('X responded 503');
    await vi.runAllTimersAsync();
    await settled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('starts no request once the deadline has passed', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchJson('https://example.org', { source: 'X', deadline: Date.now() - 1 })).rejects.toThrow('X: out of time');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the method, headers and body it is given', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', fetch);
    await fetchJson('https://example.org', { source: 'X', init: { method: 'POST', body: '[]' } });
    expect(fetch).toHaveBeenCalledWith('https://example.org', expect.objectContaining({ method: 'POST', body: '[]' }));
  });
});

describe('eachWithFallback', () => {
  const previous = (item: string) => (item === 'b' ? [`old ${item}`] : []);
  const name = (item: string) => item;

  it('tries a failure once more, then keeps its previous records and says so', async () => {
    const calls = new Map<string, number>();
    const fetch = async (item: string) => {
      calls.set(item, (calls.get(item) ?? 0) + 1);
      // c fails once and answers the second time; b always fails.
      if (item === 'b' || (item === 'c' && calls.get(item) === 1)) throw new Error(`${item} down`);
      return [`new ${item}`];
    };
    const { records, warning } = await eachWithFallback(['a', 'b', 'c'], { name, fetch, previous });
    expect(records).toEqual(['new a', 'old b', 'new c']);
    expect(warning).toBe('1 of 3 failed. b (previous kept): b down');
    expect(calls.get('b')).toBe(2);
  });

  it('names an item with no previous records as missing', async () => {
    const fetch = async (item: string) => (item === 'a' ? Promise.reject(new Error('down')) : [`new ${item}`]);
    expect((await eachWithFallback(['a', 'b'], { name, fetch, previous })).warning).toBe('1 of 2 failed. a (missing): down');
  });

  it('throws when nothing could be fetched, so the whole previous file stays', async () => {
    await expect(eachWithFallback(['a', 'b'], { name, fetch: () => Promise.reject(new Error('down')), previous })).rejects.toThrow('down');
  });
});

describe('publishDataset with a warning', () => {
  it('publishes the data and records the attempt as failed', async () => {
    const result = await publishDataset({
      id: 'demo',
      schema,
      dataDir: dir,
      now: clock('2026-10-28T12:00:00Z'),
      produce: async () => ({ records: [{ id: 'a', value: 1 }], meta, warning: '1 of 2 failed' }),
    });
    expect(result).toMatchObject({ ok: true, warning: '1 of 2 failed' });
    expect(await read('demo.json')).toEqual([{ id: 'a', value: 1 }]);
    expect(await read('meta/demo.json')).toMatchObject({
      fetchedAt: '2026-10-28T12:00:00.000Z',
      lastAttempt: { ok: false, error: '1 of 2 failed' },
    });
  });
});
