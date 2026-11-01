import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { toStorageSeries } from '../jobs/lib/agsi';
import { eiaStorageSeries, jodiStorageSeries, statcanCoordinate, statcanStorageSeries } from '../jobs/lib/storage';
import { unzipEntry, zipEntries } from '../jobs/lib/unzip';
import { mixColors, type Rgba } from '../src/lib/color';
import { addMonths, periodSummary, storageByCountry, storageColor, storageSummary, vsLastYearPct } from '../src/lib/gasStorage';
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

});

describe('mixColors', () => {
  it('interpolates and clamps', () => {
    expect(mixColors([0, 0, 0, 0], [200, 100, 50, 255], 0.5)).toEqual([100, 50, 25, 128]);
    expect(mixColors([0, 0, 0, 0], [200, 100, 50, 255], 2)).toEqual([200, 100, 50, 255]);
  });
});

const volume = (id: string, points: [string, number][], extra: Partial<ObservationSeries> = {}): ObservationSeries => ({
  id,
  metric: 'storage_gas_volume',
  unit: 'million m³',
  points: points.map(([date, value]) => ({ date, value })),
  ...extra,
});

describe('storage by period', () => {
  it('moves months across years', () => {
    expect(addMonths('2026-08', -12)).toBe('2025-08');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
  });

  it('compares a month with the month before and the same month last year', () => {
    const s = periodSummary(volume('jodi-storage-jp', [['2025-08', 6194], ['2026-07', 6388], ['2026-08', 6519]]), 'monthly');
    expect(s).toMatchObject({ latest: { date: '2026-08' }, previous: { date: '2026-07' }, lastYear: { date: '2025-08', value: 6194 } });
    expect(vsLastYearPct(s)).toBeCloseTo(5.25, 2);
  });

  it('compares a week with 52 weeks back, and leaves out what is missing', () => {
    const s = periodSummary(volume('eia-storage-us', [['2025-10-24', 3900], ['2026-10-16', 3650], ['2026-10-23', 3724]]), 'weekly');
    expect(s).toMatchObject({ previous: { value: 3650 }, lastYear: { date: '2025-10-24' } });
    const lone = periodSummary(volume('jodi-storage-nz', [['2026-08', 127]]), 'monthly');
    expect(lone).toMatchObject({ previous: null, lastYear: null });
    expect(vsLastYearPct(lone)).toBeNull();
    expect(vsLastYearPct(periodSummary(volume('x', [['2025-08', 0], ['2026-08', 5]]), 'monthly'))).toBeNull();
  });
});

describe('storageByCountry', () => {
  const all = [
    series([['2025-10-27', 90], ['2026-10-27', 81]]),
    volume('jodi-storage-de', [['2025-08', 10000], ['2026-08', 11815]]),
    volume('jodi-storage-jp', [['2025-08', 6194], ['2026-08', 6519]], { caution: true }),
    volume('eia-storage-us', [['2025-10-24', 3900], ['2026-10-23', 3724]], { unit: 'Bcf' }),
    volume('eia-storage-us-east', [['2026-10-23', 913]], { unit: 'Bcf' }),
    volume('eia-storage-us-pacific', [['2026-10-23', 297]], { unit: 'Bcf' }),
    volume('jodi-storage-us', [['2026-08', 92982]]),
  ];
  const byCountry = storageByCountry(all);

  it('takes AGSI+ before JODI, and EIA before JODI for the US', () => {
    expect(byCountry.get('DE')).toMatchObject({ source: 'agsi', cadence: 'daily', fill: 81 });
    expect(byCountry.get('DE')?.vsLastYearPct).toBeCloseTo(-10, 5);
    expect(byCountry.get('US')).toMatchObject({ source: 'eia', cadence: 'weekly', fill: null });
    expect(byCountry.get('US')?.parts.map((p) => p.id)).toEqual(['east', 'pacific']);
  });

  it('falls back to JODI, carrying its caution flag', () => {
    expect(byCountry.get('JP')).toMatchObject({ source: 'jodi', cadence: 'monthly', caution: true, parts: [] });
    expect([...byCountry.keys()]).toEqual(['DE', 'JP', 'US']);
  });

  it('shades less gas than last year one way and more the other, neutral when not known', () => {
    const colors: Record<'storageLess' | 'storageEven' | 'storageMore' | 'storageNone', Rgba> = {
      storageLess: [200, 0, 0, 200],
      storageEven: [100, 100, 100, 100],
      storageMore: [0, 0, 200, 200],
      storageNone: [1, 1, 1, 1],
    };
    expect(storageColor(undefined, colors)).toEqual(colors.storageNone);
    expect(storageColor({ vsLastYearPct: null }, colors)).toEqual(colors.storageEven);
    expect(storageColor({ vsLastYearPct: -30 }, colors)).toEqual(colors.storageLess);
    expect(storageColor({ vsLastYearPct: 90 }, colors)).toEqual(colors.storageMore);
    expect(storageColor({ vsLastYearPct: 15 }, colors)).toEqual([50, 50, 150, 150]);
  });
});

describe('storage jobs', () => {
  it('reads EIA weekly rows into the Lower 48 and its regions, and fails on a stalled report', () => {
    const rows = ['NW2_EPG0_SWO_R48_BCF', 'NW2_EPG0_SWO_R31_BCF', 'NW2_EPG0_SWO_R32_BCF', 'NW2_EPG0_SWO_R33_BCF', 'NW2_EPG0_SWO_R34_BCF', 'NW2_EPG0_SWO_R35_BCF'].flatMap(
      (series) => [
        { period: '2026-10-23', series, value: '100', units: 'BCF' },
        { period: '2026-10-16', series, value: null, units: 'BCF' },
      ],
    );
    const out = eiaStorageSeries(rows, '2026-11-01');
    expect(out.map((s) => s.id)).toEqual([
      'eia-storage-us',
      'eia-storage-us-east',
      'eia-storage-us-midwest',
      'eia-storage-us-south-central',
      'eia-storage-us-mountain',
      'eia-storage-us-pacific',
    ]);
    expect(out[0]).toMatchObject({ metric: 'storage_gas_volume', unit: 'Bcf', points: [{ date: '2026-10-23', value: 100 }] });
    expect(() => eiaStorageSeries(rows, '2026-12-31')).toThrow(/days old/);
  });

  it('reads Statistics Canada closing inventory in thousand m³ as million m³ by month', () => {
    const coords = [1, 6, 7, 9, 10, 11].map(statcanCoordinate);
    const body = coords.map((coordinate) => ({
      status: 'SUCCESS',
      object: { coordinate, vectorDataPoint: [{ refPer: '2026-08-01', value: 28081063, scalarFactorCode: 3 }, { refPer: '2026-07-01', value: null, scalarFactorCode: 3 }] },
    }));
    expect(coords[0]).toBe('1.2.1.0.0.0.0.0.0.0');
    const out = statcanStorageSeries(body, '2026-11-01');
    expect(out[0]).toMatchObject({ id: 'statcan-storage-ca', label: 'Canada', unit: 'million m³', points: [{ date: '2026-08', value: 28081.063 }] });
    expect(out).toHaveLength(6);
  });

  it('keeps JODI closing stocks it assesses, flags caution, and sets aside empty and stale countries', () => {
    const csv = [
      'REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE',
      'JP,2026-07,NATGAS,CLOSTLV,M3,6388.0000,1',
      'JP,2026-08,NATGAS,CLOSTLV,M3,6519.0000,1',
      'JP,2026-08,NATGAS,CLOSTLV,TJ,250000.0000,1',
      'JP,2026-08,NATGAS,STOCKCH,M3,131.0000,1',
      'RU,2026-08,NATGAS,CLOSTLV,M3,50.0000,3',
      'NO,2026-08,NATGAS,CLOSTLV,M3,46.0000,2',
      'CH,2026-08,NATGAS,CLOSTLV,M3,0.0000,1',
      'IN,2024-09,NATGAS,CLOSTLV,M3,278.5400,1',
      'JP,2022-01,NATGAS,CLOSTLV,M3,9000.0000,1',
    ].join('\n');
    const out = jodiStorageSeries(csv, { today: '2026-11-01', fromMonth: '2024-09', label: (c) => c });
    expect(out.series.map((s) => [s.id, s.points.length, s.caution ?? false])).toEqual([
      ['jodi-storage-jp', 2, false],
      ['jodi-storage-no', 1, true],
    ]);
    expect(out).toMatchObject({ stale: ['IN'], none: ['CH'] });
  });

  it('unzips a deflated entry', () => {
    const name = Buffer.from('data.csv');
    const content = Buffer.from('a,b\n1,2\n');
    const packed = deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const directoryAt = local.length + name.length + packed.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(directoryAt, 16);
    const zip = Buffer.concat([local, name, packed, central, name, end]);
    expect(zipEntries(zip)).toEqual(['data.csv']);
    expect(unzipEntry(zip).toString()).toBe('a,b\n1,2\n');
    expect(() => unzipEntry(zip, (n) => n.endsWith('.json'))).toThrow(/one matching entry/);
  });
});
