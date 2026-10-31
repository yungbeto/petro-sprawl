import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { addDays } from '../src/lib/flow';
import { changeWindows, describeChange, flowChange, measuredChanges, transitChange } from '../src/lib/measuredChanges';
import type { ObservationSeries } from '../src/types';
import { chokepoint, lngTerminal, pipeline } from './fixtures';

const LATEST = '2026-10-29';
const now = new Date('2026-10-31T12:00:00Z');

/** 35 daily points ending on `latest`: the prior 28 days at `prior`, the last 7 at `recent`. */
const series = (id: string, prior: number, recent: number, extra: Partial<ObservationSeries> = {}, latest = LATEST): ObservationSeries => ({
  id,
  metric: 'gas_flow_kwh_d',
  unit: 'kWh/d',
  points: Array.from({ length: 35 }, (_, i) => ({ date: addDays(latest, i - 34), value: i < 28 ? prior : recent })),
  ...extra,
});

describe('change windows', () => {
  it('compares the latest 7 days with the 28 before them', () => {
    const w = changeWindows(series('s', 10, 4), now);
    expect(w?.recent).toMatchObject({ mean: 4, from: '2026-10-23', to: LATEST, count: 7 });
    expect(w?.prior).toMatchObject({ mean: 10, from: '2026-09-25', to: '2026-10-22', count: 28 });
  });

  it('leaves out a series whose latest point is too old to be news, or too short to compare', () => {
    expect(changeWindows(series('s', 10, 4, {}, '2026-10-01'), now)).toBeNull();
    expect(changeWindows({ ...series('s', 10, 4), points: series('s', 10, 4).points.slice(-10) }, now)).toBeNull();
  });
});

describe('transit changes', () => {
  it('counts a move of 25% or more', () => {
    const fell = transitChange(series('t', 10, 7), now);
    expect(fell?.direction).toBe('fell');
    expect(fell?.relative).toBeCloseTo(-0.3);
    expect(transitChange(series('t', 10, 13), now)).toMatchObject({ direction: 'rose' });
    expect(transitChange(series('t', 10, 8), now)).toBeNull();
  });

  it('ignores straits carrying too few ships for a share to mean much', () => {
    // Hormuz since March 2026: under one transit a day, so one ship is a large share.
    expect(transitChange(series('t', 0.8, 2), now)).toBeNull();
  });
});

describe('flow changes', () => {
  const cap = { capacity: 1000 };
  it('finds a stop and a restart across the idle line', () => {
    expect(flowChange(series('f', 500, 0, cap), now, true)?.direction).toBe('stopped');
    expect(flowChange(series('f', 0, 400, cap), now, true)?.direction).toBe('resumed');
    expect(flowChange(series('f', 0, 0, cap), now, true)).toBeNull();
    // Without a capacity, only zero is idle.
    expect(flowChange(series('f', 500, 0), now, true)?.direction).toBe('stopped');
  });

  it('counts swings of 15 points of capacity only where asked', () => {
    const fell = flowChange(series('f', 500, 300, cap), now, true);
    expect(fell?.direction).toBe('fell');
    expect(fell?.shareChange).toBeCloseTo(-0.2);
    expect(flowChange(series('f', 500, 400, cap), now, true)).toBeNull();
    expect(flowChange(series('f', 500, 300, cap), now, false)).toBeNull();
  });
});

describe('measured changes on Home', () => {
  const data: Datasets = {
    ...EMPTY_DATASETS,
    chokepoints: [chokepoint('babelm', [43, 12]), chokepoint('suez', [32, 30])],
    pipelines: [
      pipeline({ id: 'a', name: 'Line A', flowSeriesId: 'entsog-a' }),
      // A second section on the same meter isn't listed twice.
      pipeline({ id: 'a2', name: 'Line A, second section', flowSeriesId: 'entsog-a' }),
      pipeline({ id: 'b', name: 'Line B', flowSeriesId: 'entsog-b' }),
    ],
    lngTerminals: [
      lngTerminal({ id: 'gem-1-import', name: 'Swinging LNG', facility: 'import', sendOutSeriesId: 'alsi-1' }),
      lngTerminal({ id: 'gem-2-import', name: 'Stopped LNG', facility: 'import', sendOutSeriesId: 'alsi-2' }),
    ],
    series: [
      series('portwatch-babelm', 10, 6),
      series('portwatch-suez', 10, 10.5),
      series('entsog-a', 500, 200, { capacity: 1000 }),
      series('entsog-b', 500, 510, { capacity: 1000 }),
      series('alsi-1', 100, 300, { capacity: 1000 }),
      series('alsi-2', 100, 0, { capacity: 1000 }),
    ],
  };

  it('lists stops first, then the largest moves, each on its asset', () => {
    const changes = measuredChanges(data, now);
    expect(changes.map((c) => [c.selection.kind, c.selection.id, c.direction])).toEqual([
      ['lng', 'gem-2-import', 'stopped'],
      ['pipeline', 'a', 'fell'],
      ['chokepoint', 'babelm', 'fell'],
    ]);
    expect(changes[0]?.source.name).toBe('GIE ALSI');
  });

  it('says what moved, never why', () => {
    const [stopped, line, strait] = measuredChanges(data, now);
    expect(describeChange(stopped!)).toBe('no send-out over 7 days');
    expect(describeChange(line!)).toBe('flow down 30 points of capacity on the 4 weeks before');
    expect(describeChange(strait!)).toBe('tanker transits down 40% on the 4 weeks before');
  });
});
