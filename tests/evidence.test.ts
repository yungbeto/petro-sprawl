import { describe, expect, it } from 'vitest';
import { dailyTotals, toFlowSeries, type OperationalRow } from '../jobs/lib/entsog';
import {
  ALSI_METER,
  isUnverified,
  latestClaim,
  measuredEvidence,
  pipelineFlow,
  withMeasuredEvidence,
  withMeasuredLngEvidence,
  isReport,
  reportParts,
  statusBasis,
} from '../src/lib/evidence';
import { toSendOutSeries } from '../jobs/lib/alsi';
import { flowLineWidthPx } from '../src/lib/encoding';
import { formatEnergyPerDay } from '../src/lib/format';
import type { Evidence, ObservationSeries } from '../src/types';
import { lngTerminal, pipeline } from './fixtures';

const row = (date: string, value: number | null, unit = 'kWh/d'): OperationalRow => ({
  indicator: 'Physical Flow',
  periodFrom: `${date}T06:00:00+02:00`,
  pointKey: 'ITP-1',
  operatorKey: 'XX-TSO-0001',
  directionKey: 'entry',
  unit,
  value,
});

const days = (n: number, end = '2026-10-27') =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${end}T00:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));

const series = (value: number, capacity?: number): ObservationSeries => ({
  id: 'entsog-x',
  metric: 'gas_flow_kwh_d',
  unit: 'kWh/d',
  label: 'Strandzha 2',
  points: days(100).map((date) => ({ date, value })),
  ...(capacity ? { capacity } : {}),
});

describe('ENTSOG transforms', () => {
  it('adds up items reported for the same gas day and skips nulls', () => {
    expect(dailyTotals([row('2026-10-01', 5), row('2026-10-01', 7), row('2026-10-02', null), row('2026-09-30', 1)])).toEqual([
      { date: '2026-09-30', value: 1 },
      { date: '2026-10-01', value: 12 },
    ]);
  });

  it('rejects unexpected units', () => {
    expect(() => dailyTotals([row('2026-10-01', 5, 'MWh/h')])).toThrow(/unit/);
  });

  it('builds a series with the latest capacity and fails on stale data', () => {
    const opts = { today: '2026-10-28', keepDays: 400, maxLagDays: 7 };
    const s = toFlowSeries('entsog-x', 'Point', [row('2026-10-27', 10)], [row('2026-10-20', 90), row('2026-10-26', 100)], opts);
    expect(s).toMatchObject({ metric: 'gas_flow_kwh_d', capacity: 100, label: 'Point', points: [{ date: '2026-10-27', value: 10 }] });
    expect(() => toFlowSeries('entsog-x', 'Point', [row('2026-10-01', 10)], [], opts)).toThrow(/days old/);
    expect(() => toFlowSeries('entsog-x', 'Point', [], [], opts)).toThrow(/no physical flow/);
  });
});

describe('measured evidence', () => {
  it('reads flow as a share of capacity', () => {
    expect(pipelineFlow(series(50, 200))).toMatchObject({ latestDate: '2026-10-27', recentMean: 50, share: 0.25 });
  });

  it('is operating while gas moves and idle when it does not', () => {
    expect(measuredEvidence(series(565_500_000, 587_700_000))).toMatchObject({
      status: 'operating',
      sourceType: 'measured',
      observedAt: '2026-10-27',
      statement: '7-day mean 565.5 GWh/d, 96% of firm technical capacity at Strandzha 2 (ENTSOG)',
    });
    expect(measuredEvidence(series(0, 1_580_000_000))?.status).toBe('idle');
    expect(measuredEvidence(series(0))?.status).toBe('idle');
  });

  it('puts measured evidence first only on linked pipelines, keeping the latest claim reachable', () => {
    const claim: Evidence = { status: 'offline', sourceType: 'press', observedAt: '2025-01-01', recordedAt: '2026-10-28' };
    const [linked, plain] = withMeasuredEvidence(
      [pipeline({ id: 'a', flowSeriesId: 'entsog-x', evidence: [claim] }), pipeline({ id: 'b', evidence: [claim] })],
      [series(0, 100)],
    );
    expect(linked!.evidence.map((e) => e.sourceType)).toEqual(['measured', 'press']);
    expect(latestClaim(linked!)).toBe(claim);
    expect(plain!.evidence).toEqual([claim]);
  });
});

describe('ALSI send-out', () => {
  const opts = { today: '2026-10-29', keepDays: 120, maxLagDays: 7 };

  it('adds facilities by day in kWh/d, skips missing values, and sums the latest declared capacity', () => {
    const a = [
      { gasDayStart: '2026-10-26', sendOut: '100', dtrs: '150', status: 'C' },
      { gasDayStart: '2026-10-27', sendOut: '105.4', dtrs: '144.1', status: 'C' },
    ];
    const b = [
      { gasDayStart: '2026-10-27', sendOut: '50', dtrs: '60', status: 'E' },
      { gasDayStart: '2026-10-25', sendOut: '-', dtrs: '-', status: 'E' },
    ];
    expect(toSendOutSeries('alsi-x', 'X', [a, b], opts)).toEqual({
      id: 'alsi-x',
      metric: 'lng_sendout_kwh_d',
      unit: 'kWh/d',
      label: 'X',
      points: [
        { date: '2026-10-26', value: 100e6 },
        { date: '2026-10-27', value: 155.4e6 },
      ],
      capacity: 204.1e6,
    });
  });

  it('returns null for a facility with nothing reported, and throws when the data stalled', () => {
    expect(toSendOutSeries('alsi-x', 'X', [[{ gasDayStart: '2026-10-27', sendOut: '-', dtrs: '-' }]], opts)).toBeNull();
    expect(() => toSendOutSeries('alsi-x', 'X', [[{ gasDayStart: '2026-10-01', sendOut: '1', dtrs: '2' }]], opts)).toThrow(
      /days old/,
    );
  });

  it('puts measured send-out first on linked terminals, citing ALSI without naming a point', () => {
    const s = { ...series(0, 183_400_000), id: 'alsi-t', metric: 'lng_sendout_kwh_d' as const, label: 'Toscana FSRU' };
    const dataset: Evidence = { status: 'operating', sourceType: 'dataset', observedAt: '2026-07-27', recordedAt: '2026-10-28' };
    const [linked, plain] = withMeasuredLngEvidence(
      [lngTerminal({ id: 't', sendOutSeriesId: 'alsi-t', evidence: [dataset] }), lngTerminal({ id: 'u', evidence: [dataset] })],
      [s],
    );
    expect(linked!.evidence[0]).toMatchObject({ status: 'idle', sourceType: 'measured', url: ALSI_METER.url });
    expect(linked!.evidence[0]!.statement).toMatch(/of declared send-out capacity \(GIE ALSI\)$/);
    expect(linked!.evidence[0]!.statement).not.toMatch(/Toscana/);
    expect(latestClaim(linked!)).toBe(dataset);
    expect(plain!.evidence).toEqual([dataset]);
  });
});

describe('symmetric aging', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const at = (observedAt: string, status: Evidence['status']): Evidence => ({
    status,
    sourceType: 'press',
    observedAt,
    recordedAt: '2026-10-28',
  });

  it('marks any status unverified past 30 days, the same way', () => {
    for (const status of ['operating', 'offline', 'idle', 'unknown'] as const) {
      expect(isUnverified(at('2026-09-27', status), now)).toBe(true);
      expect(isUnverified(at('2026-09-29', status), now)).toBe(false);
    }
  });

  it('counts a month-only date from the end of the month', () => {
    expect(isUnverified(at('2026-10', 'offline'), now)).toBe(false);
    expect(isUnverified(at('2026-09', 'offline'), now)).toBe(false);
    expect(isUnverified(at('2026-08', 'offline'), now)).toBe(true);
    expect(isUnverified(undefined, now)).toBe(false);
  });
});

describe('flow encodings', () => {
  it('sizes the inner line by share, capped at the outer line', () => {
    expect(flowLineWidthPx(6, 0.5)).toBe(3);
    expect(flowLineWidthPx(6, 1.4)).toBe(6);
    expect(flowLineWidthPx(6, 0)).toBe(0);
    expect(flowLineWidthPx(1, 0.01)).toBe(0.75);
  });

  it('formats kWh/d as GWh/d', () => {
    expect(formatEnergyPerDay(565_504_000)).toBe('565.5 GWh/d');
  });
});

describe('reportParts', () => {
  const base = { status: 'operating' as const, sourceType: 'press' as const, observedAt: '2026-09-04', recordedAt: '2026-09-05' };
  it('splits the closing credit from the text', () => {
    expect(
      reportParts({ ...base, statement: 'Gulf LNG exports remain far below pre-war levels (Bloomberg, via Energy Connects).', url: 'https://www.energyconnects.com/a' }),
    ).toEqual({ text: 'Gulf LNG exports remain far below pre-war levels.', publisher: 'Bloomberg, via Energy Connects', host: 'energyconnects.com' });
  });
  it('keeps a statement without a credit whole', () => {
    const statement = 'Pumping to Ceyhan steady, a North Oil Company source told Shafaq News.';
    expect(reportParts({ ...base, statement })).toEqual({ text: statement });
  });
  it('only takes a credit at the very end', () => {
    expect(reportParts({ ...base, statement: 'Flows (about 1.7 bcm) held in March.' }).publisher).toBeUndefined();
  });
});

describe('isReport', () => {
  it('counts claims from people and publications, not datasets or meters', () => {
    const e = { status: 'operating' as const, observedAt: '2026-09-04', recordedAt: '2026-09-05' };
    expect(isReport({ ...e, sourceType: 'press' })).toBe(true);
    expect(isReport({ ...e, sourceType: 'operator' })).toBe(true);
    expect(isReport({ ...e, sourceType: 'dataset' })).toBe(false);
    expect(isReport({ ...e, sourceType: 'measured' })).toBe(false);
  });
});

describe('statusBasis', () => {
  it('tells a meter, a dated report and a dataset listing apart', () => {
    expect(statusBasis({ sourceType: 'measured' })).toBe('measured');
    expect(statusBasis({ sourceType: 'press' })).toBe('reported');
    expect(statusBasis({ sourceType: 'government' })).toBe('reported');
    expect(statusBasis({ sourceType: 'dataset' })).toBe('listed');
    expect(statusBasis(undefined)).toBe('none');
  });
});
