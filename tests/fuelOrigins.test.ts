import { describe, expect, it } from 'vitest';
import { fuelOrigins } from '../src/lib/fuelOrigins';
import type { FuelMonth, FuelOriginRegion } from '../src/types';

const month = (period: string, over: Partial<FuelMonth> = {}): FuelMonth => ({
  period,
  supplied: 100,
  imports: [
    { code: 'CAN', name: 'Canada', kbbl: 10 },
    { code: 'NOR', name: 'Norway', kbbl: 0.5 },
  ],
  receipts: [{ from: 'padd-3', kbbl: 60, pipeline: 54, tankerBarge: 6, rail: 0 }],
  ethanol: { receipts: [{ from: 'padd-2', kbbl: 9, pipeline: 0, tankerBarge: 1, rail: 8 }], imports: [] },
  ...over,
});

const year = (over: Partial<FuelMonth> = {}) =>
  ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((p) =>
    month(p, over),
  );

const record = (months = year()): FuelOriginRegion => ({ id: 'padd-1/gasoline', region: 'padd-1', fuel: 'gasoline', months });

const shares = (rows: { key: string; share: number }[]) => rows.map((r) => [r.key, Math.round(r.share * 1000) / 10]);

describe('fuelOrigins', () => {
  it('shares what the region used by where it came from, the rest made locally or from stocks', () => {
    const o = fuelOrigins(record())!;
    // 60 received, 10.5 imported, 9 ethanol of 100 used: 20.5 left.
    expect(o.basis).toBe('supplied');
    expect(shares(o.rows)).toEqual([
      ['region/padd-3', 60],
      ['own', 20.5],
      ['country/CAN', 10],
      ['ethanol', 9],
      ['other', 0.5],
    ]);
    expect(Math.round(o.suppliedPerDay)).toBe(Math.round(1_200_000 / 365));
  });

  it('folds imports EIA does not name by country into other countries, whatever their share', () => {
    const imports = [
      { code: 'CAN', name: 'Canada', kbbl: 10 },
      { code: 'unnamed', name: 'Countries EIA does not name', kbbl: 5 },
    ];
    const rows = fuelOrigins(record(year({ imports })))!.rows;
    expect(rows.find((r) => r.key === 'country/unnamed')).toBeUndefined();
    expect(rows.find((r) => r.key === 'other')).toMatchObject({ label: 'Other countries', detail: 'Some EIA does not name', share: 0.05 });
    const mixed = fuelOrigins(record(year({ imports: [...imports, { code: 'NOR', name: 'Norway', kbbl: 0.5 }] })))!.rows;
    expect(mixed.find((r) => r.key === 'other')).toMatchObject({ label: '1 other country', detail: 'Each under 1%, some EIA does not name' });
  });

  it('says how each part arrives', () => {
    const rows = fuelOrigins(record())!.rows;
    expect(rows.find((r) => r.key === 'region/padd-3')).toMatchObject({ label: 'Gulf Coast', detail: 'Mostly by pipeline (90%)' });
    expect(rows.find((r) => r.key === 'ethanol')?.detail).toBe('Mostly from the Midwest (100%), by rail (89%)');
    expect(rows.find((r) => r.key === 'own')?.label).toBe('Made in the region or drawn from stocks');
  });

  it('switches to shares of what flowed in when more came in than the region used', () => {
    const o = fuelOrigins(record(year({ supplied: 50 })))!;
    expect(o.basis).toBe('inflow');
    expect(o.rows.some((r) => r.kind === 'own')).toBe(false);
    expect(o.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1);
  });

  it('works without ethanol, and needs a full window of months', () => {
    expect(fuelOrigins(record(year({ ethanol: undefined }))!)!.rows.some((r) => r.kind === 'ethanol')).toBe(false);
    expect(fuelOrigins(record(year().slice(1)))).toBeNull();
  });
});
