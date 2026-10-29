import { describe, expect, it } from 'vitest';
import { areaName, importsByPadd, importsOf, partnerName, productionByPadd, receiptsByPadd, refineryInputByPadd, toFuelRegions, toRegions, type EiaRow } from '../jobs/lib/eia';
import { largestCities, paddHubs, placeName, zctaStates, zipRanges } from '../jobs/lib/us-lookup';
import { PADDS } from '../src/lib/config';

const row = (duoarea: string, value: number | string | null, description: string, over: Partial<EiaRow> = {}): EiaRow => ({
  period: '2026-07',
  duoarea,
  'area-name': null,
  'series-description': description,
  units: 'MBBL',
  value,
  ...over,
});

describe('EIA crude rows', () => {
  it('keeps countries, drops group rows, and checks them against the total', () => {
    const rows = [
      row('R30-Z00', 300, 'Gulf Coast (PADD 3) Imports by PADD of Processing of Crude Oil (Thousand Barrels)', { 'area-name': 'PADD 3' }),
      row('R30-NCA', 200, 'Gulf Coast (PADD 3) Imports by PADD of Processing from Canada of Crude Oil (Thousand Barrels)', { 'area-name': 'CAN' }),
      row('R30-NMX', 100, 'Gulf Coast (PADD 3) Imports by PADD of Processing from Mexico of Crude Oil (Thousand Barrels)', { 'area-name': 'MEX' }),
      row('R30-ME0', 50, 'Gulf Coast (PADD 3) Imports by PADD of Processing from OPEC Countries of Crude Oil (Thousand Barrels)', { 'area-name': 'NA' }),
      row('R30-NCA', 7, 'per day', { 'area-name': 'CAN', units: 'MBBL/D' }),
    ];
    expect(importsByPadd(rows).get('padd-3')?.get('2026-07')).toEqual([
      { code: 'CAN', name: 'Canada', kbbl: 200 },
      { code: 'MEX', name: 'Mexico', kbbl: 100 },
    ]);
    expect(() => importsByPadd([...rows, row('R30-NVE', 90, 'Gulf Coast (PADD 3) Imports by PADD of Processing from Venezuela of Crude Oil', { 'area-name': 'VEN' })])).toThrow(/add up/);
  });

  it('reads receipts as "to-from", with the mode splits', () => {
    const total = [row('R30-R20', '45', 'Gulf Coast (PADD 3) Receipts ... from Midwest (PADD 2) of Crude Oil')];
    const receipts = receiptsByPadd({ total, pipeline: [row('R30-R20', 44, 'p')], tankerBarge: [], rail: [row('R30-R20', 1, 'r')] });
    expect(receipts.get('padd-3')?.get('2026-07')).toEqual([{ from: 'padd-2', kbbl: 45, pipeline: 44, tankerBarge: 0, rail: 1 }]);
  });

  it('groups production by the PADD of each state or offshore area, and skips withheld values', () => {
    const rows = [
      row('STX', 178, 'Texas Field Production of Crude Oil (Thousand Barrels)'),
      row('SNM', 75, 'New Mexico Field Production of Crude Oil (Thousand Barrels)'),
      row('R3FM', 63, 'Federal Offshore--Gulf of America Field Production of Crude Oil (Thousand Barrels)'),
      row('SND', null, 'North Dakota Field Production of Crude Oil (Thousand Barrels)'),
    ];
    expect(productionByPadd(rows).get('padd-3')?.get('2026-07')).toEqual([
      { area: 'Texas', kbbl: 178 },
      { area: 'New Mexico', kbbl: 75 },
      { area: 'Federal offshore, Gulf of America', kbbl: 63 },
    ]);
    expect(productionByPadd(rows).get('padd-2')).toBeUndefined();
    expect(areaName('Federal Offshore--Gulf of America Field Production of Crude Oil (Thousand Barrels)')).toBe('Federal offshore, Gulf of America');
  });

  it('keeps only months every PADD reports, newest last', () => {
    const input = refineryInputByPadd(
      PADDS.flatMap((p) => [row(p.eia, 100, 'input'), row(p.eia, 100, 'input', { period: '2026-06' })]).concat(row('R10', 100, 'input', { period: '2026-08' })),
    );
    const imports = importsByPadd(
      PADDS.flatMap((p) => ['2026-06', '2026-07', '2026-08'].map((period) => row(`${p.eia}-Z00`, 0, 'total', { period }))),
    );
    const receipts = receiptsByPadd({ total: [row('R30-R20', 5, 'r'), row('R30-R20', 5, 'r', { period: '2026-06' })], pipeline: [], tankerBarge: [], rail: [] });
    const regions = toRegions({ imports, receipts, input, production: new Map() }, { months: 12 });
    expect(regions.map((r) => r.id)).toEqual(['padd-1', 'padd-2', 'padd-3', 'padd-4', 'padd-5']);
    expect(regions[0]!.months.map((m) => m.period)).toEqual(['2026-06', '2026-07']);
    expect(regions[2]!.months[1]).toMatchObject({ refineryInput: 100, imports: [], receipts: [{ from: 'padd-2', kbbl: 5 }] });
  });
});

describe('EIA fuel rows', () => {
  it('reads the country from a description, even one with "of" in its name', () => {
    expect(partnerName('East Coast (PADD 1) Imports from Canada of Gasoline Blending Components (Thousand Barrels)')).toBe('Canada');
    expect(partnerName('Gulf Coast (PADD 3) Imports by PADD of Processing from Democratic Republic of the Congo of Crude Oil (Thousand Barrels)')).toBe(
      'Democratic Republic of the Congo',
    );
  });

  it('adds gasoline and its blending components, each checked against its own total', () => {
    const imp = (product: string, duoarea: string, value: number, area: string) =>
      row(duoarea, value, `East Coast (PADD 1) Imports from ${area === 'PADD 1' ? 'All Countries' : area === 'CAN' ? 'Canada' : 'Norway'} of X (Thousand Barrels)`, { product, 'area-name': area });
    const rows = [
      imp('EPM0F', 'R10-Z00', 5, 'PADD 1'),
      imp('EPM0F', 'R10-NCA', 5, 'CAN'),
      imp('EPOBG', 'R10-Z00', 30, 'PADD 1'),
      imp('EPOBG', 'R10-NCA', 10, 'CAN'),
      imp('EPOBG', 'R10-NNO', 20, 'NOR'),
    ];
    expect(importsOf(rows, ['EPM0F', 'EPOBG']).get('padd-1')?.get('2026-07')).toEqual([
      { code: 'NOR', name: 'Norway', kbbl: 20 },
      { code: 'CAN', name: 'Canada', kbbl: 15 },
    ]);
  });

  it('builds one record per PADD and fuel, with ethanol beside gasoline', () => {
    const supplied = PADDS.flatMap((p) => ['EPM0F', 'EPD0', 'EPJK'].map((product) => row(p.eia, 100, 'supplied', { product })));
    const total = [
      row('R10-R30', 60, 'gasoline', { product: 'EPOBG' }),
      row('R10-R30', 5, 'finished', { product: 'EPM0F' }),
      row('R10-R20', 9, 'ethanol', { product: 'EPOOXE' }),
      row('R10-R30', 40, 'diesel', { product: 'EPD0' }),
      row('R10-R30', 30, 'jet', { product: 'EPJK' }),
    ];
    const records = toFuelRegions({ supplied, imports: [], receipts: { total, pipeline: [], tankerBarge: [], rail: [] } }, { months: 12 });
    expect(records.map((r) => r.id)).toHaveLength(15);
    const gasoline = records.find((r) => r.id === 'padd-1/gasoline')!;
    expect(gasoline.months[0]).toMatchObject({ period: '2026-07', supplied: 100, receipts: [{ from: 'padd-3', kbbl: 65 }] });
    expect(gasoline.months[0]!.ethanol?.receipts).toMatchObject([{ from: 'padd-2', kbbl: 9 }]);
    expect(records.find((r) => r.id === 'padd-1/diesel')!.months[0]!.ethanol).toBeUndefined();
  });
});

describe('US lookup tables', () => {
  it('assigns each ZCTA to the state with most of its land, and runs them into ranges', () => {
    const text = [
      'OID_ZCTA5_20|GEOID_ZCTA5_20|GEOID_COUNTY_20|AREALAND_PART',
      '1|43215|39049|900',
      '2|43216|39049|10',
      '3|43216|18001|500',
      '4|46001|18001|100',
      '5||18003|5',
    ].join('\n');
    const pairs = zctaStates(text, new Map([['39', 'Ohio'], ['18', 'Indiana']]));
    expect(pairs).toEqual([
      [43215, 'Ohio'],
      [43216, 'Indiana'],
      [46001, 'Indiana'],
    ]);
    expect(zipRanges(pairs, ['Indiana', 'Ohio'])).toEqual([
      [43215, 43215, 1],
      [43216, 46001, 0],
    ]);
  });

  it('cleans Census place names and takes the largest places', () => {
    expect(placeName('Houston city')).toBe('Houston');
    expect(placeName('Nashville-Davidson metropolitan government (balance)')).toBe('Nashville-Davidson');
    expect(placeName('Louisville/Jefferson County metro government (balance)')).toBe('Louisville');
    expect(placeName('Urban Honolulu CDP')).toBe('Honolulu');
    const csv = ['SUMLEV,NAME,STNAME,POP', '040,Texas,Texas,9', '162,Austin city,Texas,1', '162,Houston city,Texas,2', '061,Harris County,Texas,5'].join('\n');
    expect(largestCities(csv, 5, 'POP')).toEqual([
      { name: 'Houston', state: 'Texas' },
      { name: 'Austin', state: 'Texas' },
    ]);
  });

  it('weights each PADD hub by refining capacity, leaving out Alaska and Hawaii', () => {
    const refineries = PADDS.flatMap((_, i) => [
      { padd: i + 1, state: 'X', capacity: 100, lon: -90, lat: 30 },
      { padd: i + 1, state: 'X', capacity: 300, lon: -94, lat: 34 },
    ]);
    refineries.push({ padd: 5, state: 'Alaska', capacity: 1000, lon: -150, lat: 61 });
    expect(paddHubs(refineries)['padd-5']).toEqual([-93, 33]);
  });
});
