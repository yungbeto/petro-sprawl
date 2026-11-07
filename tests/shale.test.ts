import { describe, expect, it } from 'vitest';
import { SHALE } from '../src/lib/config';
import { missingPlays, shaleSeriesIds, steoReleaseDate, toShalePlay, toShaleSeries, type EiaPlayProps, type SteoRow } from '../jobs/lib/shale';
import { shalePlaySchema, shaleSeriesSchema } from '../jobs/lib/schemas';
import {
  formationById,
  formationRows,
  formatShaleValue,
  latestMonth,
  leadSeries,
  playsInProvince,
  playsWithoutFormation,
  regionActivity,
  shaleSummary,
  sharingPlays,
  yearChangePct,
} from '../src/lib/shale';
import type { ShalePlay, ShaleSeries } from '../src/types';

const props = (over: Partial<EiaPlayProps> = {}): EiaPlayProps => ({
  ID: 'BAK001',
  Shale_play: 'Bakken',
  Basin: 'Williston',
  Lithology: 'Mixed Shale &  Dolostone',
  Age_shale: 'Devonian-Mississipp.',
  Area_sq_km: 67156.33,
  References: 'EIA',
  lx: -102.123456,
  ly: 47.987654,
  CODE: null,
  ...over,
});
const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

describe('toShalePlay', () => {
  it('keeps EIA words, tags the formation named for the outline, and the province only when joined', () => {
    const play = toShalePlay(props(), square);
    expect(play).toMatchObject({ id: 'eia-bak001', name: 'Bakken', lithology: 'Mixed Shale & Dolostone', areaKm2: 67156, formation: 'bakken', labelPoint: [-102.1235, 47.9877] });
    expect(play.provinceId).toBeUndefined();
    expect(toShalePlay(props({ ID: 'WOL001', CODE: 5044 }), square)).toMatchObject({ formation: 'permian', provinceId: 'usgs-5044' });
    expect(shalePlaySchema.safeParse(play).success).toBe(true);
  });

  it("gives no formation to an outline EIA's coverage isn't confirmed for", () => {
    expect(toShalePlay(props({ ID: 'THR001', Shale_play: 'Three Forks' }), square).formation).toBeUndefined();
    expect(toShalePlay(props({ ID: 'NIO005', Shale_play: 'Niobrara' }), square).formation).toBeUndefined();
  });

  it('names outlines in config that the shapefile lacks', () => {
    const all = SHALE.formations.flatMap((f) => f.plays);
    expect(missingPlays(all)).toEqual([]);
    expect(missingPlays(all.filter((id) => id !== 'EAG001'))).toEqual(['EAG001']);
  });
});

describe('STEO series', () => {
  it('asks for every formation, the totals and four series per region', () => {
    const ids = shaleSeriesIds().map((s) => s.id);
    expect(ids).toContain('TOPRPM');
    expect(ids).toContain('SNGPRMC');
    expect(ids).toContain('TOPRL48');
    expect(ids).toContain('DUCSHA');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(18 + 2 + SHALE.regions.length * 4);
  });

  it("reads the release date, not the next one", () => {
    const page = 'Release Date:</strong> October 6, 2026 &nbsp;|&nbsp; Next Release Date:</strong> November 10, 2026';
    expect(steoReleaseDate(page)).toBe('2026-10-06');
    expect(steoReleaseDate('Next Release Date: November 10, 2026')).toBeNull();
    expect(steoReleaseDate('no date here')).toBeNull();
  });

  const row = (period: string, value: SteoRow['value'], seriesId = 'TOPRPM'): SteoRow => ({
    period,
    seriesId,
    seriesDescription: 'Tight oil production from Permian formations',
    value,
    unit: 'million barrels per day',
  });
  const wanted = [{ id: 'TOPRPM', kind: 'oil' as const }];

  it('keeps history oldest first, the last months only, and drops withheld values', () => {
    const rows = [row('2026-09', 6.173), row('2026-07', '6.159'), row('2026-08', null), row('2026-06', 6.147)];
    const [s] = toShaleSeries(rows, wanted, '2026-10-06', 2);
    expect(s!.points).toEqual([
      { period: '2026-07', value: 6.159 },
      { period: '2026-09', value: 6.173 },
    ]);
    expect(s).toMatchObject({ id: 'TOPRPM', kind: 'oil', unit: 'million barrels per day', release: '2026-10-06' });
    expect(shaleSeriesSchema.safeParse(s).success).toBe(true);
  });

  it('refuses a series with a value in or after the release month: a forecast', () => {
    expect(() => toShaleSeries([row('2026-09', 6.1), row('2026-10', 6.2)], wanted, '2026-10-06')).toThrow(/forecast/);
    // A placeholder month with no value isn't a forecast.
    expect(() => toShaleSeries([row('2026-09', 6.1), row('2026-10', null)], wanted, '2026-10-06')).not.toThrow();
  });

  it('throws on a series STEO no longer has', () => {
    expect(() => toShaleSeries([row('2026-09', 6.1)], [...wanted, { id: 'TOPRXX', kind: 'oil' }], '2026-10-06')).toThrow(/TOPRXX/);
  });
});

describe('shale plays in the app', () => {
  const series = (id: string, kind: ShaleSeries['kind'], values: [string, number][]): ShaleSeries => ({
    id,
    kind,
    name: id,
    unit: null,
    release: '2026-10-06',
    points: values.map(([period, value]) => ({ period, value })),
  });
  const play = (id: string, formation: string | undefined, areaKm2: number, provinceId?: string): ShalePlay => ({
    id,
    name: id,
    basin: 'Permian',
    lithology: 'Shale',
    age: 'Permian',
    areaKm2,
    reference: 'EIA',
    labelPoint: [0, 0],
    geometry: square,
    ...(formation ? { formation } : {}),
    ...(provinceId ? { provinceId } : {}),
  });
  const data = {
    shalePlays: [play('wolfcamp', 'permian', 10, 'usgs-5044'), play('spraberry', 'permian', 30, 'usgs-5044'), play('bakken', 'bakken', 50), play('three-forks', undefined, 5)],
    shaleSeries: [
      series('TOPRPM', 'oil', [['2025-09', 6.0], ['2026-08', 6.2], ['2026-09', 6.3]]),
      series('SNGPRPM', 'gas', [['2026-09', 27.1]]),
      series('TOPRBK', 'oil', [['2026-09', 1.2]]),
      series('SNGPRMC', 'gas', [['2026-09', 25.5]]),
      series('SNGPRHA', 'gas', [['2026-09', 16.0]]),
      series('TOPRL48', 'oil', [['2026-09', 9.0]]),
      series('SNGPRL48', 'gas', [['2026-08', 80], ['2026-09', 81.5]]),
      series('RIGSPM', 'rigs', [['2026-09', 290]]),
    ],
  };

  it('compares the newest month with the same month a year earlier', () => {
    const latest = latestMonth(data.shaleSeries[0]);
    expect(latest).toEqual({ period: '2026-09', value: 6.3, yearAgo: 6.0 });
    expect(yearChangePct(latest)).toBeCloseTo(5);
    expect(yearChangePct(latestMonth(data.shaleSeries[2]))).toBeNull();
    expect(latestMonth(undefined)).toBeNull();
  });

  it('orders formations by tight oil, then gas-only ones by gas, with their outlines largest first', () => {
    const rows = formationRows(data);
    expect(rows.map((r) => r.formation.id)).toEqual(['permian', 'bakken', 'marcellus', 'haynesville']);
    expect(rows[0]!.plays.map((p) => p.id)).toEqual(['spraberry', 'wolfcamp']);
    expect(rows[2]!.plays).toEqual([]);
  });

  it('leads with oil where EIA reports it, else gas', () => {
    expect(leadSeries(data, formationById('permian'))?.id).toBe('TOPRPM');
    expect(leadSeries(data, formationById('marcellus'))?.id).toBe('SNGPRMC');
    expect(leadSeries(data, undefined)).toBeUndefined();
  });

  it('names the plays sharing a figure, those without one, and those in a province', () => {
    expect(sharingPlays(data.shalePlays[0]!, data.shalePlays).map((p) => p.id)).toEqual(['spraberry']);
    expect(sharingPlays(data.shalePlays[3]!, data.shalePlays)).toEqual([]);
    expect(playsWithoutFormation(data.shalePlays).map((p) => p.id)).toEqual(['three-forks']);
    expect(playsInProvince('usgs-5044', data.shalePlays).map((p) => p.id)).toEqual(['spraberry', 'wolfcamp']);
  });

  it("gives a formation's region activity only where EIA has a region and counts", () => {
    expect(regionActivity(data, formationById('permian'))?.rigs?.id).toBe('RIGSPM');
    expect(regionActivity(data, formationById('bakken'))).toBeNull();
    expect(regionActivity(data, formationById('barnett'))).toBeNull();
  });

  it("sums up the Lower 48's month and the largest formation's share", () => {
    expect(shaleSummary(data)).toEqual({ period: '2026-09', oil: 9.0, gas: 81.5, largest: { label: 'Permian', share: 0.7 }, release: '2026-10-06' });
    expect(shaleSummary({ shalePlays: [], shaleSeries: [] })).toBeNull();
  });

  it('formats oil to two decimals, gas to one and counts whole', () => {
    expect(formatShaleValue({ kind: 'oil' }, 6.173)).toBe('6.17');
    expect(formatShaleValue({ kind: 'gas' }, 1234.56)).toBe('1,234.6');
    expect(formatShaleValue({ kind: 'rigs' }, 290.4)).toBe('290');
  });
});
