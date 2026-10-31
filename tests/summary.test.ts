import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import {
  corridorRows,
  diffSnapshots,
  median,
  nextVisit,
  firstSentence,
  dateAgo,
  lastReported,
  quietSince,
  parseVisitRecord,
  situation,
  statusCounts,
  statusGroups,
  storageRows,
  takeSnapshot,
  type Snapshot,
} from '../src/lib/summary';
import type { Disruption, Evidence, ObservationSeries } from '../src/types';
import { lngTerminal, oilTerminal, pipeline } from './fixtures';

const claim = (status: Evidence['status'], observedAt: string, sourceType: Evidence['sourceType'] = 'press'): Evidence => ({
  status,
  sourceType,
  observedAt,
  recordedAt: observedAt,
});

const fillSeries = (country: string, points: [string, number][]): ObservationSeries => ({
  id: `agsi-${country}`,
  metric: 'storage_fill_pct',
  unit: '%',
  points: points.map(([date, value]) => ({ date, value })),
});

const now = new Date('2026-10-28T12:00:00Z');

describe('dashboard helpers', () => {
  it('takes the median of odd and even lists', () => {
    expect(median([3, -1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('folds statuses into running, stopped, unbuilt and unknown', () => {
    const groups = statusGroups([
      { status: 'operating', count: 10 },
      { status: 'reduced', count: 1 },
      { status: 'idle', count: 2 },
      { status: 'offline', count: 3 },
      { status: 'planned', count: 4 },
    ]);
    expect(groups.map((g) => [g.id, g.count])).toEqual([
      ['running', 11],
      ['stopped', 5],
      ['unbuilt', 4],
      ['unknown', 0],
    ]);
  });
});

describe('summary counts', () => {
  it('counts pipelines by current status in a fixed order', () => {
    const counts = statusCounts([
      pipeline({ id: 'a', evidence: [claim('planned', '2026-01-01')] }),
      pipeline({ id: 'b', evidence: [claim('operating', '2026-01-01')] }),
      pipeline({ id: 'c', evidence: [claim('operating', '2026-01-01')] }),
      pipeline({ id: 'd' }),
    ]);
    expect(counts).toEqual([
      { status: 'operating', count: 2 },
      { status: 'planned', count: 1 },
      { status: 'unknown', count: 1 },
    ]);
  });

  it('lists corridor pipelines, problems first, flagging old claims nothing measured backs', () => {
    const rows = corridorRows(
      [
        pipeline({ id: 'gem-only', sources: ['gem'], evidence: [claim('offline', '2020-01-01', 'dataset')] }),
        pipeline({ id: 'aaa', name: 'Aaa', sources: ['curated'], evidence: [claim('operating', '2026-04-01')] }),
        pipeline({ id: 'zzz', name: 'Zzz', sources: ['curated'], evidence: [claim('offline', '2026-10-20')] }),
        pipeline({
          id: 'met',
          name: 'Met',
          sources: ['curated'],
          evidence: [claim('operating', '2026-10-27', 'measured'), claim('operating', '2025-01-01')],
        }),
      ],
      now,
    );
    expect(rows.map((r) => r.selection.id)).toEqual(['zzz', 'aaa', 'met']);
    expect(rows[1]).toMatchObject({ unverifiedSince: '2026-04-01', measured: false });
    expect(rows[2]).toMatchObject({ measured: true });
    expect(rows[2]).not.toHaveProperty('unverifiedSince');
  });

  it('ranks storage furthest below last year first, and countries without last year last', () => {
    const data: Datasets = {
      ...EMPTY_DATASETS,
      series: [
        fillSeries('de', [['2025-10-27', 75], ['2026-10-27', 62]]),
        fillSeries('it', [['2025-10-27', 90], ['2026-10-27', 92]]),
        fillSeries('at', [['2026-10-27', 50]]),
      ],
    };
    const rows = storageRows(data);
    expect(rows.map((r) => [r.country, r.vsLastYear])).toEqual([
      ['DE', -13],
      ['IT', 2],
      ['AT', null],
    ]);
    expect(rows[0]?.selection).toEqual({ kind: 'storage', id: 'de' });
  });
});

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  savedAt: '2026-10-20T08:00:00Z',
  pipelines: {},
  flowShares: {},
  chokepoints: {},
  storage: {},
  disruptions: [],
  ...overrides,
});

const name = (s: { kind: string; id: string }) => `${s.kind}:${s.id}`;

describe('what changed since last visit', () => {
  it('snapshots statuses, measured shares, storage and disruptions', () => {
    const data: Datasets = {
      ...EMPTY_DATASETS,
      pipelines: [pipeline({ id: 'ts', evidence: [claim('operating', '2026-10-01')] })],
      series: [fillSeries('de', [['2026-10-27', 62]])],
      disruptions: [
        { id: 'd1', assetKind: 'pipeline', assetId: 'ts', startedAt: '2026-10', cause: 'other', summary: 's', sources: [], recordedAt: '2026-10-28' },
      ],
    };
    expect(takeSnapshot(data, now)).toEqual({
      savedAt: '2026-10-28T12:00:00.000Z',
      pipelines: { ts: 'operating' },
      flowShares: {},
      chokepoints: {},
      storage: { de: 62 },
      disruptions: ['d1'],
    });
  });

  it('reports status, band, flow and storage changes past their thresholds', () => {
    const before = snapshot({
      pipelines: { a: 'operating', b: 'operating', gone: 'offline' },
      flowShares: { a: 0.9, b: 0.5 },
      chokepoints: { hormuz: 'near', suez: 'below' },
      storage: { de: 60, it: 80 },
    });
    const after = snapshot({
      savedAt: '2026-10-28T12:00:00Z',
      pipelines: { a: 'idle', b: 'operating', added: 'planned' },
      flowShares: { a: 0, b: 0.6 },
      chokepoints: { hormuz: 'below', suez: 'below' },
      storage: { de: 63, it: 81 },
    });
    const changes = diffSnapshots(before, after, EMPTY_DATASETS, name);
    expect(changes.map((c) => [c.kind, c.selection.id])).toEqual([
      ['status', 'a'],
      ['band', 'hormuz'],
      ['flow-share', 'a'],
      ['storage', 'de'],
    ]);
    expect(changes[0]).toMatchObject({ from: 'operating', to: 'idle', name: 'pipeline:a' });
  });

  it('reports new disruptions, but not all of them when the last visit had none loaded', () => {
    const data: Datasets = {
      ...EMPTY_DATASETS,
      disruptions: ['old', 'new'].map((id) => ({
        id,
        assetKind: 'chokepoint' as const,
        assetId: 'babelm',
        startedAt: '2026-10-01',
        cause: 'conflict' as const,
        summary: id,
        sources: [],
        recordedAt: '2026-10-28',
      })),
    };
    const after = snapshot({ disruptions: ['old', 'new'] });
    expect(diffSnapshots(snapshot({ disruptions: ['old'] }), after, data, name)).toEqual([
      { kind: 'disruption', selection: { kind: 'chokepoint', id: 'babelm' }, name: 'chokepoint:babelm', startedAt: '2026-10-01', summary: 'new' },
    ]);
    expect(diffSnapshots(snapshot(), after, data, name)).toEqual([]);
  });

  it('keeps the baseline across reloads within one visit, and rolls it on a new visit', () => {
    const first = snapshot({ savedAt: '2026-10-20T08:00:00Z' });
    const second = snapshot({ savedAt: '2026-10-28T12:00:00Z' });
    const reload = snapshot({ savedAt: '2026-10-28T12:10:00Z' });
    const later = snapshot({ savedAt: '2026-10-28T13:00:00Z' });

    expect(nextVisit(null, first)).toEqual({ compareTo: null, record: { previous: null, current: first } });
    const v2 = nextVisit({ previous: null, current: first }, second);
    expect(v2.compareTo).toBe(first);
    const v3 = nextVisit(v2.record, reload);
    expect(v3).toEqual({ compareTo: first, record: { previous: first, current: reload } });
    expect(nextVisit(v3.record, later).compareTo).toBe(reload);
  });

  it('reads back what it stores and ignores anything else', () => {
    const record = { previous: null, current: snapshot() };
    expect(parseVisitRecord(JSON.stringify(record))).toEqual(record);
    expect(parseVisitRecord(null)).toBeNull();
    expect(parseVisitRecord('{not json')).toBeNull();
    expect(parseVisitRecord(JSON.stringify({ current: { savedAt: 'x' } }))).toBeNull();
    expect(parseVisitRecord(JSON.stringify({ previous: 'junk', current: snapshot() }))?.previous).toBeNull();
  });
});

describe('situation', () => {
  const disruption = (over: Partial<Disruption>): Disruption => ({
    id: 'd',
    assetKind: 'pipeline',
    assetId: 'test-line',
    startedAt: '2026-01',
    cause: 'conflict',
    summary: '',
    sources: [],
    recordedAt: '2026-10-01',
    ...over,
  });

  it('lists disruptions still in effect, newest first, and counts the assets they touch', () => {
    const data: Datasets = {
      ...EMPTY_DATASETS,
      pipelines: [pipeline(), pipeline({ id: 'other', name: 'Other line' })],
      lngTerminals: [lngTerminal()],
      oilTerminals: [oilTerminal()],
      disruptions: [
        disruption({ id: 'a', startedAt: '2022-09-26' }),
        disruption({ id: 'b', startedAt: '2026-03', assetId: 'test-line' }),
        disruption({ id: 'c', startedAt: '2026-07', endedAt: '2026-08', assetId: 'other' }),
        disruption({ id: 'd', startedAt: '2026-10-27', assetKind: 'terminal', assetId: 'test-terminal' }),
        disruption({ id: 'e', startedAt: '2026-03', assetKind: 'lng', assetId: 'gem-t1-export' }),
        disruption({ id: 'f', startedAt: '2026-05', assetId: 'missing' }),
      ],
    };
    const s = situation(data);
    expect(s.ongoing.map((o) => o.disruption.id)).toEqual(['d', 'b', 'e', 'a']);
    expect(s.ongoing[0]).toMatchObject({ name: 'Test terminal', selection: { kind: 'terminal', id: 'test-terminal' } });
    expect(s.assets).toEqual({ chokepoints: 0, pipelines: 1, terminals: 2 });
    expect(s.latest?.disruption.id).toBe('d');
  });

  it('leads with the newest report, so news on an old disruption brings it back up', () => {
    const source = (publishedAt: string) => ({ publisher: 'P', title: 'T', url: 'https://example.com/', publishedAt });
    const data: Datasets = {
      ...EMPTY_DATASETS,
      pipelines: [pipeline()],
      disruptions: [
        disruption({ id: 'new-start', startedAt: '2026-10-20', sources: [source('2026-10-20')] }),
        disruption({ id: 'old-start', startedAt: '2026-03', sources: [source('2026-04-01'), source('2026-10-27')] }),
      ],
    };
    expect(situation(data).ongoing.map((o) => o.disruption.id)).toEqual(['old-start', 'new-start']);
    expect(lastReported(data.disruptions[1]!)).toBe('2026-10-27');
    // With no dated source after it, the start counts as the last report.
    expect(lastReported(disruption({ startedAt: '2026-05-02' }))).toBe('2026-05-02');
  });

  it('says when a disruption in effect has had no report in STALE_AFTER_DAYS', () => {
    const source = (publishedAt: string) => ({ publisher: 'P', title: 'T', url: 'https://example.com/', publishedAt });
    expect(quietSince(disruption({ sources: [source('2026-08-07')] }), now)).toBe('2026-08-07');
    expect(quietSince(disruption({ sources: [source('2026-10-20')] }), now)).toBeNull();
  });

  it('takes the first sentence of a summary', () => {
    expect(firstSentence('Iran closed the strait on 2026-03-02. Traffic fell.')).toBe('Iran closed the strait on 2026-03-02.');
    expect(firstSentence('About 650,000 b/d. U.S. data agree')).toBe('About 650,000 b/d.');
    expect(firstSentence('No full stop')).toBe('No full stop');
  });
});

describe('dateAgo', () => {
  // Noon local time, 30 October.
  const now = new Date(2026, 9, 30, 12);
  it('reads recent days as news does', () => {
    expect(dateAgo('2026-10-30', now)).toBe('today');
    expect(dateAgo('2026-10-29', now)).toBe('yesterday');
    expect(dateAgo('2026-10-27', now)).toBe('3 days ago');
  });
  it('gives the date once it is older, and keeps a month as it is', () => {
    expect(dateAgo('2026-07-20', now)).toBe('2026-07-20');
    expect(dateAgo('2026-05', now)).toBe('2026-05');
  });
});
