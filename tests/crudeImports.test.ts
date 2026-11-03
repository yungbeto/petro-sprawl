import { describe, expect, it } from 'vitest';
import {
  addMonths,
  comtradeImports,
  countryCodes,
  eiaImports,
  eurostatImports,
  importersByValue,
  largestImporters,
  type ComtradeAreas,
  type ComtradeRow,
  type JsonStat,
} from '../jobs/lib/crudeImports';
import { countryArcs, countryHighlight, countryOrigins, crudeImportList, importPeriod, importsSurfaceHighlight, topSuppliers, topSuppliersLine } from '../src/lib/crudeImports';
import type { CountryCrudeImports, OilOriginRegion, OilRoute } from '../src/types';
import { oilTerminal } from './fixtures';

const area = (id: number, text: string, iso2?: string, iso3?: string, isGroup = false): ComtradeAreas[number] => ({
  id,
  text,
  ...(iso2 ? { PartnerCodeIsoAlpha2: iso2, reporterCodeIsoAlpha2: iso2 } : {}),
  ...(iso3 ? { PartnerCodeIsoAlpha3: iso3, reporterCodeIsoAlpha3: iso3 } : {}),
  isGroup,
});
const areas: ComtradeAreas = [
  area(0, 'World', undefined, undefined, true),
  area(156, 'China', 'CN', 'CHN'),
  area(276, 'Germany', 'DE', 'DEU'),
  area(300, 'Greece', 'GR', 'GRC'),
  area(356, 'India', 'IN', 'IND'),
  area(458, 'Malaysia', 'MY', 'MYS'),
  area(490, 'Other Asia, nes'),
  area(578, 'Norway', 'NO', 'NOR'),
  area(643, 'Russian Federation', 'RU', 'RUS'),
  area(682, 'Saudi Arabia', 'SA', 'SAU'),
  area(840, 'USA', 'US', 'USA'),
  area(899, 'Areas, nes'),
  area(97, 'EU', undefined, undefined, true),
];
const codes = countryCodes(areas);

describe('country codes', () => {
  it('maps ISO alpha-2 and alpha-3 both ways, skipping groups and areas without codes', () => {
    expect(codes.iso3.get('SA')).toBe('SAU');
    expect(codes.iso2.get('RUS')).toBe('RU');
    expect(codes.iso3.size).toBe(9);
  });

  it('moves months across years', () => {
    expect(addMonths('2026-02', -3)).toBe('2025-11');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
  });
});

/** A JSON-stat body from cells keyed by geo, partner and month. */
function jsonStat(cells: { geo: string; partner: string; time: string; value: number }[], dims: { geo: string[]; partner: string[]; time: string[] }): JsonStat {
  const order = ['freq', 'siec', 'partner', 'unit', 'geo', 'time'];
  const categories: Record<string, string[]> = { freq: ['M'], siec: ['O4100_TOT'], unit: ['THS_T'], ...dims };
  const size = order.map((d) => categories[d]!.length);
  const strides = size.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const value: Record<string, number> = {};
  for (const c of cells) {
    const coords: Record<string, string> = { freq: 'M', siec: 'O4100_TOT', unit: 'THS_T', geo: c.geo, partner: c.partner, time: c.time };
    const flat = order.reduce((a, d, i) => a + categories[d]!.indexOf(coords[d]!) * strides[i]!, 0);
    value[String(flat)] = c.value;
  }
  return {
    id: order,
    size,
    value,
    dimension: Object.fromEntries(
      order.map((d) => [
        d,
        {
          category: {
            index: Object.fromEntries(categories[d]!.map((c, i) => [c, i])),
            ...(d === 'partner' ? { label: { NO: 'Norway', SA: 'Saudi Arabia', NSP: 'Not specified', TOTAL: 'Total', EU27_2020: 'EU' } } : {}),
          },
        },
      ]),
    ),
  };
}

describe('Eurostat transform', () => {
  const months = ['2025-12', '2026-01', '2026-02'];
  const body = jsonStat(
    [
      // Greece (EL): two months reported, the third missing.
      { geo: 'EL', partner: 'TOTAL', time: '2025-12', value: 100 },
      { geo: 'EL', partner: 'TOTAL', time: '2026-01', value: 200 },
      { geo: 'EL', partner: 'SA', time: '2025-12', value: 60 },
      { geo: 'EL', partner: 'SA', time: '2026-01', value: 150 },
      { geo: 'EL', partner: 'NSP', time: '2026-01', value: 50 },
      { geo: 'EL', partner: 'EU27_2020', time: '2026-01', value: 40 },
      { geo: 'EL', partner: 'NO', time: '2025-12', value: 40 },
      // The UK stopped reporting: left out.
      { geo: 'UK', partner: 'TOTAL', time: '2025-12', value: 0 },
      // An aggregate reporter: left out.
      { geo: 'EU27_2020', partner: 'TOTAL', time: '2026-01', value: 9000 },
    ],
    { geo: ['EL', 'UK', 'EU27_2020'], partner: ['TOTAL', 'EU27_2020', 'NO', 'SA', 'NSP'], time: months },
  );

  it('sums each partner over the window, maps Eurostat codes to ISO and keeps unnamed partners without codes', () => {
    const [greece, ...rest] = eurostatImports(body, { codes, sinceMonth: '2025-10', retrieved: '2026-11-01' });
    expect(rest).toEqual([]);
    expect(greece).toMatchObject({ id: 'GR', iso3: 'GRC', source: 'eurostat', unit: 'thousand tonnes', to: '2026-01', monthsReported: 2, total: 300 });
    expect(greece!.from).toBe('2025-02');
    expect(greece!.partners).toEqual([
      { iso2: 'SA', iso3: 'SAU', label: 'Saudi Arabia', value: 210 },
      { iso2: null, iso3: null, label: 'Not specified', value: 50 },
      { iso2: 'NO', iso3: 'NOR', label: 'Norway', value: 40 },
    ]);
  });

  it('leaves out reporters whose latest total is older than sinceMonth', () => {
    expect(eurostatImports(body, { codes, sinceMonth: '2026-02', retrieved: '2026-11-01' })).toEqual([]);
  });
});

const row = (reporterCode: number, partnerCode: number, primaryValue: number | null, netWgt: number | null, period = '2025', extra: Partial<ComtradeRow> = {}): ComtradeRow => ({
  period,
  reporterCode,
  partnerCode,
  partner2Code: 0,
  customsCode: 'C00',
  motCode: 0,
  netWgt,
  primaryValue,
  ...extra,
});

describe('UN Comtrade transform', () => {
  it('ranks importers by value from the world rows, the later year winning, and skips reporters without ISO codes', () => {
    const byValue = importersByValue(
      [
        row(156, 0, 300e9, null, '2024'),
        row(156, 0, 320e9, null, '2025'),
        row(356, 0, 140e9, null, '2025'),
        row(490, 0, 50e9, null, '2025'),
        row(276, 0, 60e9, null, '2025', { motCode: 2100 }),
      ],
      areas,
    );
    expect([...byValue.keys()]).toEqual(['CN', 'IN']);
    expect(byValue.get('CN')).toEqual({ year: '2025', value: 320e9, code: 156 });
    expect(largestImporters(byValue, 1)).toEqual(['CN']);
  });

  it('takes partners by net weight when weights cover the value, with unnamed areas kept without codes', () => {
    const rows = [row(356, 643, 50e9, 90e9), row(356, 682, 30e9, 50e9), row(356, 899, 1e9, 2e9), row(356, 97, 9e9, 9e9), row(356, 643, 10e9, 9e9, '2024')];
    const india = comtradeImports('IN', rows, { partners: areas, importsUsd: { year: '2025', value: 81e9 }, iso3: 'IND', retrieved: '2026-11-01' });
    expect(india).toMatchObject({ id: 'IN', source: 'comtrade', basis: 'weight', unit: 'tonnes', from: '2025', to: '2025', monthsReported: null });
    expect(india!.partners.map((p) => [p.iso2, p.value])).toEqual([
      ['RU', 90e6],
      ['SA', 50e6],
      [null, 2e6],
    ]);
  });

  it('falls back to value when weights are missing for too much of it', () => {
    const china = comtradeImports('CN', [row(156, 643, 60e9, null), row(156, 458, 20e9, 30e9)], { partners: areas, importsUsd: null, iso3: 'CHN', retrieved: '2026-11-01' });
    expect(china).toMatchObject({ basis: 'value', unit: 'US$', total: 80e9 });
    expect(comtradeImports('CN', [row(156, 0, 1, 1)], { partners: areas, importsUsd: null, iso3: 'CHN', retrieved: '2026-11-01' })).toBeNull();
  });
});

describe('EIA transform for the United States', () => {
  const month = (period: string, imports: [string, number][]) => ({
    period,
    refineryInput: 0,
    imports: imports.map(([code, kbbl]) => ({ code, name: code === 'SAU' ? 'Saudi Arabia' : code === 'NOR' ? 'Norway' : 'Other', kbbl })),
    receipts: [],
    production: [],
  });
  const periods = Array.from({ length: 13 }, (_, i) => addMonths('2025-08', i));
  const regions: OilOriginRegion[] = [
    { id: 'padd-1', name: 'East Coast', months: periods.map((p) => month(p, [['SAU', 10], ['NOR', 5]])) },
    { id: 'padd-3', name: 'Gulf Coast', months: periods.map((p) => month(p, [['SAU', 20], ['XXX', 1]])) },
  ];

  it('sums imports by country across the regions over the latest 12 months', () => {
    const us = eiaImports(regions, { codes, importsUsd: null, retrieved: '2026-11-01' });
    expect(us).toMatchObject({ id: 'US', iso3: 'USA', source: 'eia', from: '2025-09', to: '2026-08', monthsReported: 12, total: 432 });
    expect(us!.partners).toEqual([
      { iso2: 'SA', iso3: 'SAU', label: 'Saudi Arabia', value: 360 },
      { iso2: 'NO', iso3: 'NOR', label: 'Norway', value: 60 },
      { iso2: null, iso3: null, label: 'Other', value: 12 },
    ]);
  });

  it('needs a full window', () => {
    expect(eiaImports([{ ...regions[0]!, months: regions[0]!.months.slice(0, 6) }], { codes, importsUsd: null, retrieved: '2026-11-01' })).toBeNull();
  });
});

const record = (overrides: Partial<CountryCrudeImports> = {}): CountryCrudeImports => ({
  id: 'IN',
  iso3: 'IND',
  source: 'comtrade',
  basis: 'weight',
  unit: 'tonnes',
  from: '2025',
  to: '2025',
  monthsReported: null,
  total: 1000,
  partners: [
    { iso2: 'RU', iso3: 'RUS', label: 'Russian Federation', value: 400 },
    { iso2: 'SA', iso3: 'SAU', label: 'Saudi Arabia', value: 500 },
    { iso2: null, iso3: null, label: 'Areas, nes', value: 80 },
    { iso2: 'NO', iso3: 'NOR', label: 'Norway', value: 15 },
    { iso2: 'MY', iso3: 'MYS', label: 'Malaysia', value: 5 },
  ],
  importsUsd: { year: '2025', value: 140e9 },
  retrieved: '2026-11-01',
  ...overrides,
});

const terminals = [oilTerminal({ id: 'ras-tanura', name: 'Ras Tanura', exitVia: ['hormuz'] }), oilTerminal({ id: 'yanbu', name: 'Yanbu', exitVia: ['babelm'] }), oilTerminal({ id: 'primorsk', name: 'Primorsk', exitVia: ['danish'] })];
const routes: OilRoute[] = [
  { country: 'SAU', terminals: ['ras-tanura', 'yanbu'], note: '', sources: [] },
  { country: 'RUS', terminals: ['primorsk'], note: '', sources: [] },
];

describe('a country\'s origins', () => {
  it('lists partners as shares, largest first, with unnamed sources and small partners in rows of their own', () => {
    const origins = countryOrigins(record(), { routes, terminals, minShare: 0.01 });
    expect(origins.rows.map((r) => [r.key, r.share])).toEqual([
      ['country/SAU', 0.5],
      ['country/RUS', 0.4],
      ['country/NOR', 0.015],
      ['unspecified', 0.08],
      ['other', 0.005],
    ]);
    expect(origins.rows[0]!.detail).toBe('Loads at Ras Tanura or Yanbu');
    expect(origins.rows.at(-1)!.label).toBe('1 other country');
    expect(origins.rows[3]!.detail).toBe('As the source gives it: Areas, nes');
  });

  it('carries the chokepoints on cited routes, certain only when every terminal passes them', () => {
    const origins = countryOrigins(record(), { routes, terminals });
    expect(origins.exposure.map((e) => [e.chokepoint, e.share, e.certain])).toEqual([
      ['hormuz', 0.5, false],
      ['babelm', 0.5, false],
      ['danish', 0.4, true],
    ]);
    expect(origins.routes.map((r) => r.country)).toEqual(['SAU', 'RUS']);
    const lit = countryHighlight(origins);
    expect([...lit.chokepoints].sort()).toEqual(['babelm', 'danish', 'hormuz']);
    expect([...lit.terminals].sort()).toEqual(['primorsk', 'ras-tanura', 'yanbu']);
    expect(countryHighlight(null).chokepoints.size).toBe(0);
  });

  it('draws an arc from each named partner with a point to the importer', () => {
    const origins = countryOrigins(record(), { routes, terminals });
    const points: Record<string, [number, number]> = { IND: [78, 22], SAU: [45, 24], RUS: [60, 58] };
    expect(countryArcs(origins, points)).toEqual([
      { key: 'country/SAU', from: [45, 24], to: [78, 22], share: 0.5, kind: 'country' },
      { key: 'country/RUS', from: [60, 58], to: [78, 22], share: 0.4, kind: 'country' },
    ]);
    expect(countryArcs({ ...origins, record: record({ iso3: null }) }, points)).toEqual([]);
  });
});

describe('the oil origins list', () => {
  it('puts the largest importers by value first, then those without a value by name', () => {
    const list = crudeImportList({
      crudeImports: [record({ id: 'TR', importsUsd: null }), record({ id: 'CN', importsUsd: { year: '2025', value: 320e9 } }), record({ id: 'BG', importsUsd: null }), record()],
    });
    expect(list.map((r) => r.id)).toEqual(['CN', 'IN', 'BG', 'TR']);
  });

  it('keeps bright the terminals and chokepoints on routes from any listed partner', () => {
    const lit = importsSurfaceHighlight({ crudeImports: [record({ partners: [{ iso2: 'RU', iso3: 'RUS', label: 'Russia', value: 1 }] })], oilRoutes: routes, oilTerminals: terminals });
    expect([...lit.terminals]).toEqual(['primorsk']);
    expect([...lit.chokepoints]).toEqual(['danish']);
  });

  it('gives the period as a year or a span of months', () => {
    expect(importPeriod({ from: '2025', to: '2025' })).toBe('2025');
    expect(importPeriod({ from: '2025-09', to: '2026-08' })).toBe('2025-09 to 2026-08');
  });
});

describe('topSuppliersLine', () => {
  it('groups ties and gives the count of importers once', () => {
    const leaders = [{ label: 'United States', count: 7 }, { label: 'Russia', count: 6 }, { label: 'Norway', count: 5 }, { label: 'Saudi Arabia', count: 5 }];
    expect(topSuppliersLine({ importers: 41, leaders })).toBe('United States (7 of 41), Russia (6), Norway and Saudi Arabia (5 each)');
    expect(topSuppliersLine({ importers: 2, leaders: [{ label: 'Norway', count: 1 }, { label: 'Russia', count: 1 }] })).toBe('Norway and Russia (1 of 2 each)');
    expect(topSuppliersLine({ importers: 0, leaders: [] })).toBeNull();
  });
});

describe('topSuppliers', () => {
  const from = (id: string, label: string, iso2: string | null) =>
    record({ id, partners: [{ iso2, iso3: null, label, value: 600 }, { iso2: 'NO', iso3: 'NOR', label: 'Norway', value: 400 }] });
  it('counts each importer\'s largest named supplier, keeping ties with the last place', () => {
    const records = [from('IN', 'Russian Federation', 'RU'), from('CN', 'Russian Federation', 'RU'), from('KR', 'Saudi Arabia', 'SA'), from('JP', 'United Arab Emirates', 'AE'), from('DE', 'Norway', 'NO'), from('XX', 'Areas, nes', null)];
    const { importers, leaders } = topSuppliers(records, 2);
    // XX's unnamed partner is larger, but Norway is its largest named one.
    expect(importers).toBe(6);
    expect(leaders).toEqual([
      { label: 'Norway', count: 2 },
      { label: countryOrigins(records[0]!).rows[0]!.label, count: 2 },
    ]);
  });
});
