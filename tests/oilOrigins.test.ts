import { describe, expect, it } from 'vitest';
import { exposure, paddForState, regionOrigins, stateForZip } from '../src/lib/oilOrigins';
import type { CrudeMonth, OilOriginRegion, OilRoute } from '../src/types';
import { oilTerminal } from './fixtures';

const month = (period: string, over: Partial<CrudeMonth> = {}): CrudeMonth => ({
  period,
  refineryInput: 100,
  imports: [
    { code: 'CAN', name: 'Canada', kbbl: 40 },
    { code: 'SAU', name: 'Saudi Arabia', kbbl: 10 },
    { code: 'NOR', name: 'Norway', kbbl: 0.5 },
  ],
  receipts: [{ from: 'padd-3', kbbl: 30, pipeline: 20, tankerBarge: 10, rail: 0 }],
  production: [
    { area: 'Ohio', kbbl: 15 },
    { area: 'Michigan', kbbl: 4.5 },
  ],
  ...over,
});

const year = (over: Partial<CrudeMonth> = {}) =>
  ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((p) =>
    month(p, over),
  );

const region = (months = year()): OilOriginRegion => ({ id: 'padd-2', name: 'Midwest', months });

const routes: OilRoute[] = [
  {
    country: 'SAU',
    terminals: ['gulf', 'red-sea'],
    note: 'x',
    sources: [{ publisher: 'EIA', title: 't', url: 'https://www.eia.gov/', publishedAt: '2025-06-16' }],
  },
];
const terminals = [
  oilTerminal({ id: 'gulf', name: 'Gulf port', exitVia: ['hormuz'] }),
  oilTerminal({ id: 'red-sea', name: 'Red Sea port', exitVia: ['babelm', 'suez'] }),
];

describe('regionOrigins', () => {
  it('shares imports, receipts and production of what flows in, largest first', () => {
    const o = regionOrigins(region(), { routes, terminals })!;
    // 40 + 10 + 0.5 imported, 30 received, 19.5 pumped: 100 a month.
    expect(o.rows.map((r) => [r.key, Math.round(r.share * 1000) / 10])).toEqual([
      ['country/CAN', 40],
      ['region/padd-3', 30],
      ['own', 19.5],
      ['country/SAU', 10],
      ['other', 0.5],
    ]);
    expect(o.from).toBe('2025-08');
    expect(o.to).toBe('2026-07');
    // 1,200 thousand barrels over 365 days.
    expect(Math.round(o.barrelsPerDay)).toBe(Math.round(1_200_000 / 365));
  });

  it('says how other regions send it and where it is pumped', () => {
    const rows = regionOrigins(region())!.rows;
    expect(rows.find((r) => r.key === 'region/padd-3')).toMatchObject({ label: 'Gulf Coast', detail: 'Mostly by pipeline (67%)' });
    expect(rows.find((r) => r.key === 'own')?.detail).toBe('Ohio (77%) and Michigan (23%)');
    expect(rows.find((r) => r.key === 'other')).toMatchObject({ label: '1 other country', detail: 'Each under 1%' });
  });

  it('names the terminals a curated route loads at', () => {
    const saudi = regionOrigins(region(), { routes, terminals })!.rows.find((r) => r.code === 'SAU');
    expect(saudi?.detail).toBe('Loads at Gulf port or Red Sea port');
    expect(regionOrigins(region())!.rows.find((r) => r.code === 'SAU')?.detail).toBeNull();
  });

  it('needs a full window of months', () => {
    expect(regionOrigins(region(year().slice(1)))).toBeNull();
  });
});

describe('exposure', () => {
  it('is an upper bound when a country can load outside the chokepoint', () => {
    const o = regionOrigins(region(), { routes, terminals })!;
    expect(o.exposure.find((e) => e.chokepoint === 'hormuz')).toMatchObject({ share: 0.1, certain: false, countries: ['Saudi Arabia'] });
  });

  it('is certain when every terminal ships through it, and adds up across countries', () => {
    const rows = [
      { key: 'a', kind: 'country' as const, label: 'A', detail: null, kbbl: 1, share: 0.2, terminals: [oilTerminal({ exitVia: ['hormuz'] })] },
      { key: 'b', kind: 'country' as const, label: 'B', detail: null, kbbl: 1, share: 0.05, terminals: [oilTerminal({ exitVia: ['hormuz'] })] },
    ];
    expect(exposure(rows)).toEqual([{ chokepoint: 'hormuz', share: 0.25, certain: true, countries: ['A', 'B'] }]);
  });
});

describe('places', () => {
  const lookup = { states: ['Ohio', 'Texas'], zipRanges: [[43001, 45999, 0], [75001, 79999, 1]] as [number, number, number][] };

  it('maps a ZIP code to its state, and leaves gaps between states unplaced', () => {
    expect(stateForZip(lookup, '43215')).toBe('Ohio');
    expect(stateForZip(lookup, '77002')).toBe('Texas');
    expect(stateForZip(lookup, '60601')).toBeNull();
    expect(stateForZip(lookup, '00501')).toBeNull();
    expect(stateForZip(lookup, '4321')).toBeNull();
  });

  it("maps a state to its PADD by EIA's definition", () => {
    expect(paddForState('Ohio')).toBe('padd-2');
    expect(paddForState('district of columbia')).toBe('padd-1');
    expect(paddForState('New Mexico')).toBe('padd-3');
    expect(paddForState('Alaska')).toBe('padd-5');
    expect(paddForState('Ontario')).toBeNull();
  });
});
