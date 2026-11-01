import { describe, expect, it } from 'vitest';
import { basinVolumes, mergeBasinCountries, toBasin } from '../jobs/lib/basins';
import { buildChokepoints } from '../jobs/lib/chokepoints';

const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

describe('toBasin', () => {
  it('maps USGS fields', () => {
    const basin = toBasin({ CODE: 1174, NAME: ' West Siberian Basin ', TYPE: 'p', O_G: 'Oil', lx: 70.123456, ly: 61.5 }, square);
    expect(basin).toMatchObject({
      id: 'usgs-1174',
      name: 'West Siberian Basin',
      provinceType: 'priority',
      dominant: 'oil',
      labelPoint: [70.1235, 61.5],
    });
  });

  it('keeps an empty dominant type as null and drops other province types', () => {
    expect(toBasin({ CODE: 1, NAME: 'X', TYPE: 'b', O_G: '', lx: 0, ly: 0 }, square)?.dominant).toBeNull();
    expect(toBasin({ CODE: 2, NAME: 'Y', TYPE: '', O_G: 'Gas', lx: 0, ly: 0 }, square)).toBeNull();
  });
});

describe('basinVolumes', () => {
  const props = { CODE: 2024, NAME: 'Mesopotamian Foredeep Basin', TYPE: 'p', O_G: 'Oil', lx: 0, ly: 0 };

  it('keeps USGS volumes, oil in million barrels and gas in billion cubic feet', () => {
    expect(
      basinVolumes({ ...props, STUDIED: '1', CUM_OIL: 56746, REM_OIL: 235696, UNDS_OIL: 61134, CUM_GAS: 10, REM_GAS: 0, UNDS_GAS: 500 }),
    ).toEqual({
      oil: { produced: 56746, remaining: 235696, undiscovered: 61134 },
      gas: { produced: 10, remaining: 0, undiscovered: 500 },
    });
  });

  it('turns no data and negative values into null, and gives none when nothing is left', () => {
    const azov = basinVolumes({ ...props, STUDIED: '1', CUM_OIL: 1000, REM_OIL: -750, UNDS_OIL: 5, CUM_GAS: -9999, REM_GAS: 11118, UNDS_GAS: 0 });
    expect(azov?.oil.remaining).toBeNull();
    expect(azov?.gas.produced).toBeNull();
    const permian = { CUM_OIL: -9999, REM_OIL: -9999, UNDS_OIL: -9999, CUM_GAS: -9999, REM_GAS: -9999, UNDS_GAS: -9999 };
    expect(basinVolumes({ ...props, STUDIED: '', ...permian })).toBeNull();
    expect(basinVolumes(props)).toBeNull();
  });

  it('gives an undiscovered estimate only where the province was assessed', () => {
    const carnarvon = basinVolumes({ ...props, STUDIED: '', CUM_OIL: 16, REM_OIL: 19, UNDS_OIL: 0, CUM_GAS: 32, REM_GAS: 70, UNDS_GAS: 0 });
    expect(carnarvon?.oil).toEqual({ produced: 16, remaining: 19, undiscovered: null });
  });
});

describe('mergeBasinCountries', () => {
  it('merges both joins, dedupes and sorts, and reports countries without an ISO code', () => {
    const { countries, skipped } = mergeBasinCountries([
      { code: 2021, iso: 'SA', name: 'Saudi Arabia' },
      { code: 2021, iso: 'BH', name: 'Bahrain' },
      { code: 2021, iso: 'SA', name: 'Saudi Arabia' },
      { code: 1112, iso: '-99', name: 'N. Cyprus' },
    ]);
    expect(countries.get(2021)).toEqual(['BH', 'SA']);
    expect(countries.has(1112)).toBe(false);
    expect(skipped).toEqual(['N. Cyprus']);
  });

  it('defaults a basin to no countries', () => {
    expect(toBasin({ CODE: 3, NAME: 'Z', TYPE: 'p', O_G: '', lx: 0, ly: 0 }, square)?.countries).toEqual([]);
  });
});

describe('buildChokepoints', () => {
  const config = [{ id: 'hormuz', name: 'Strait of Hormuz', portwatchId: 'chokepoint6', eiaReferenceMbd: 21.8 }] as const;

  it('joins config with PortWatch locations', () => {
    const result = buildChokepoints(config, [
      { portid: 'chokepoint6', portname: 'Strait of Hormuz', lat: 26.29685349, lon: 56.85984844 },
    ]);
    expect(result).toEqual([
      {
        id: 'hormuz',
        name: 'Strait of Hormuz',
        point: [56.8598, 26.2969],
        eiaReferenceMbd: 21.8,
        transitSeriesId: 'portwatch-chokepoint6',
      },
    ]);
  });

  it('fails loudly when PortWatch lacks a chokepoint', () => {
    expect(() => buildChokepoints(config, [])).toThrow(/chokepoint6/);
  });
});

import { countryToIso } from '../jobs/lib/countries';
import { gemDiameter, gemHistory, gemLength, gemRowToPipeline, joinLineParts, mapGemStatus, parseOwners, parseYear, sameCompanies, type GemRow } from '../jobs/lib/gem';
import { lngTerminals, type GemLngRow } from '../jobs/lib/lng';
import { linkSendOut, mergeLngEvidence } from '../jobs/lib/curated-lng';
import { lngTerminal } from './fixtures';

describe('countryToIso', () => {
  it('resolves current codes, not deprecated ones', () => {
    expect(countryToIso('Russia')).toBe('RU');
    expect(countryToIso('Germany')).toBe('DE');
    expect(countryToIso('Serbia')).toBe('RS');
    expect(countryToIso('Myanmar')).toBe('MM');
  });

  it("handles GEM's spellings", () => {
    expect(countryToIso('Türkiye')).toBe('TR');
    expect(countryToIso('Czech Republic')).toBe('CZ');
    expect(countryToIso('Bosnia and Herzegovina')).toBe('BA');
    expect(countryToIso('Kazkahstan')).toBe('KZ');
    expect(countryToIso('Kuwait-Saudi Arabia')).toBeNull();
  });
});

describe('GEM transforms', () => {
  it('parses owners with and without shares', () => {
    expect(parseOwners('Summit Midstream Partners LP [70.00%]; ExxonMobil [30.00%]')).toEqual([
      { name: 'Summit Midstream Partners LP', sharePct: 70 },
      { name: 'ExxonMobil', sharePct: 30 },
    ]);
    expect(parseOwners('Transneft [100.%]')).toEqual([{ name: 'Transneft', sharePct: 100 }]);
    expect(parseOwners('Some Co [unknown %]')).toEqual([{ name: 'Some Co' }]);
    expect(parseOwners('')).toEqual([]);
  });

  it('maps statuses without inventing ones GEM lacks', () => {
    expect(mapGemStatus('operating')).toBe('operating');
    expect(mapGemStatus('proposed')).toBe('planned');
    expect(mapGemStatus('construction')).toBe('under_construction');
    expect(mapGemStatus('mothballed')).toBe('idle');
    expect(mapGemStatus('shelved')).toBe('unknown');
    expect(mapGemStatus('something new')).toBe('unknown');
  });

  const row: GemRow = {
    ProjectID: 'P0765',
    PipelineName: 'TurkStream Gas Pipeline',
    SegmentName: '1',
    Wiki: 'https://www.gem.wiki/TurkStream_Gas_Pipeline',
    Status: 'operating',
    LastUpdated: '2023-08-11',
    Fuel: 'Gas',
    OtherEnglishNames: 'Turkish Stream 1 Gas Pipeline',
    CountriesOrAreas: 'Russia, Türkiye',
    StartCountryOrArea: 'Russia',
    EndCountryOrArea: 'Türkiye',
    Owner: 'Gazprom PJSC [100.00%]',
    'CapacityBcm/y': '15.75',
    RouteAccuracy: 'very high (within meters)',
    RouteType: 'Mapped route (at any accuracy)',
  };
  const line = { type: 'LineString' as const, coordinates: [[37.3, 44.9], [28.1, 41.5]] };
  const ctx = { recordedAt: '2026-10-28', releaseDate: '2025-11', sourceId: 'gem-test' };

  it('builds a pipeline with GEM status as dated dataset evidence', () => {
    const result = gemRowToPipeline(row, line, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pipeline).toMatchObject({
      id: 'gem-p0765',
      name: 'TurkStream Gas Pipeline · 1',
      commodity: 'gas',
      fromCountry: 'RU',
      toCountry: 'TR',
      transitCountries: [],
      capacity: { value: 15.75, unit: 'bcm/yr' },
      geometryApprox: false,
      evidence: [{ status: 'operating', sourceType: 'dataset', observedAt: '2023-08-11', recordedAt: '2026-10-28' }],
    });
  });

  it('uses the release month, not an invented day, when LastUpdated is missing', () => {
    const result = gemRowToPipeline({ ...row, LastUpdated: '' }, line, ctx);
    expect(result.ok && result.pipeline.evidence[0]?.observedAt).toBe('2025-11');
  });

  it('marks low-accuracy routes as approximate and converts oil to mb/d', () => {
    const oil = { ...row, Fuel: 'Oil', RouteAccuracy: 'low', 'CapacityBcm/y': '', CapacityBOEd: '1486082.19' };
    const result = gemRowToPipeline(oil, line, ctx);
    expect(result.ok && result.pipeline.geometryApprox).toBe(true);
    expect(result.ok && result.pipeline.capacity).toEqual({ value: 1.486, unit: 'mb/d' });
    // Under 1,000 b/d, three decimals of mb/d would round to zero.
    const small = gemRowToPipeline({ ...oil, CapacityBOEd: '420.4' }, line, ctx);
    expect(small.ok && small.pipeline.capacity).toEqual({ value: 0.00042, unit: 'mb/d' });
  });

  it('skips cancelled rows, rows without a route, and expansion-only rows', () => {
    expect(gemRowToPipeline({ ...row, Status: 'cancelled' }, line, ctx)).toMatchObject({ ok: false, reason: 'excluded_status' });
    expect(gemRowToPipeline(row, null, ctx)).toMatchObject({ ok: false, reason: 'no_route' });
    expect(gemRowToPipeline(row, { type: 'GeometryCollection', geometries: [] }, ctx)).toMatchObject({ ok: false, reason: 'no_route' });
    expect(gemRowToPipeline({ ...row, RouteType: 'Capacity expansion only' }, line, ctx)).toMatchObject({
      ok: false,
      reason: 'excluded_route_type',
    });
  });

  it('reads years, keeping the start of a range and dropping "Before 1990"', () => {
    expect(parseYear('1997')).toBe(1997);
    expect(parseYear('2009-2011')).toBe(2009);
    expect(parseYear('Before 1990')).toBeNull();
    expect(parseYear('')).toBeNull();
  });

  it('keeps start years in order, as targets for lines not yet built', () => {
    expect(gemHistory({ ...row, StartYear1: '2005', StartYear2: '1997', StartYear3: '', StopYear: '' })).toEqual({
      startYears: [1997, 2005],
      expected: false,
    });
    expect(gemHistory({ ...row, Status: 'proposed', StartYear1: '2029', ProposalYear: '2021' })).toEqual({
      startYears: [2029],
      expected: true,
      proposalYear: 2021,
    });
    expect(gemHistory(row)).toBeUndefined();
  });

  it('prefers the known length to the route estimate, and needs a unit for a diameter', () => {
    expect(gemLength({ ...row, LengthKnownKm: '930.4', LengthEstimateKm: '911.2' })).toEqual({ value: 930, estimated: false });
    expect(gemLength({ ...row, LengthKnownKm: '--', LengthEstimateKm: '911.6' })).toEqual({ value: 912, estimated: true });
    expect(gemLength({ ...row, LengthKnownKm: '--', LengthEstimateKm: '--' })).toBeUndefined();
    expect(gemDiameter({ ...row, Diameter: '30, 42.0', DiameterUnits: 'in' })).toBe('30, 42 in');
    expect(gemDiameter({ ...row, Diameter: '800', DiameterUnits: '' })).toBeUndefined();
  });

  it('keeps parent companies only when they say more than the owners', () => {
    expect(sameCompanies([{ name: 'Transneft' }], [{ name: 'Transneft PJSC' }])).toBe(true);
    expect(sameCompanies([{ name: 'ExxonMobil' }], [{ name: 'Exxon Mobil Corp' }])).toBe(true);
    expect(sameCompanies([{ name: 'Gazprom Export' }], [{ name: 'Gazprom PJSC' }])).toBe(false);
    const result = gemRowToPipeline(
      { ...row, Parent: 'Gazprom PJSC [100.00%]', StartLocation: 'Anapa', EndLocation: 'Kıyıköy', StartYear1: '2020' },
      line,
      ctx,
    );
    expect(result.ok && result.pipeline).toMatchObject({ endpoints: { start: 'Anapa', end: 'Kıyıköy' }, history: { startYears: [2020] } });
    expect(result.ok && result.pipeline).not.toHaveProperty('parents');
    // A segment row belongs to the system its project name gives.
    expect(result.ok && result.pipeline.system).toBe('TurkStream Gas Pipeline');
    expect(gemRowToPipeline({ ...row, SegmentName: '' }, line, ctx)).not.toHaveProperty('pipeline.system');
  });

  it('keeps a pipeline whose country has no ISO code and reports the name', () => {
    const result = gemRowToPipeline({ ...row, CountriesOrAreas: 'Kuwait-Saudi Arabia', StartCountryOrArea: 'Kuwait-Saudi Arabia', EndCountryOrArea: 'Kuwait-Saudi Arabia' }, line, ctx);
    expect(result).toMatchObject({ ok: true, unresolvedCountries: ['Kuwait-Saudi Arabia'] });
  });
});

describe('joinLineParts', () => {
  it('chains pieces that meet end to end, whichever way they run', () => {
    expect(
      joinLineParts([
        [[1, 0], [2, 0]],
        [[3, 0], [2, 0]],
        [[0, 0], [1, 0]],
      ]),
    ).toEqual([[[0, 0], [1, 0], [2, 0], [3, 0]]]);
  });

  it('leaves separate pieces apart and starts a new chain at a branch', () => {
    const parts = joinLineParts([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
      [[1, 0], [1, 1]],
      [[5, 5], [6, 6]],
    ]);
    expect(parts).toEqual([
      [[0, 0], [1, 0], [2, 0]],
      [[1, 0], [1, 1]],
      [[5, 5], [6, 6]],
    ]);
  });
});

describe('lngTerminals', () => {
  const unit = (overrides: Partial<GemLngRow> = {}): GemLngRow => ({
    ProjectID: 'T100',
    TerminalName: 'Ras Laffan LNG',
    UnitName: 'T1',
    FacilityType: 'export',
    Status: 'operating',
    OtherNames: 'North Field LNG, RL',
    'Country/Area': 'Qatar',
    Owner: 'QatarEnergy [70%]; Shell [30%]',
    Operator: 'QatarEnergy LNG',
    CapacityinMtpa: 7.8,
    ActualStartYear: 2010,
    LatestPlannedStartYear: null,
    Latitude: 25.9,
    Longitude: 51.55,
    Accuracy: 'exact',
    Offshore: null,
    Floating: null,
    Wiki: 'https://www.gem.wiki/Ras_Laffan',
    LastUpdated: '2026-03-02',
    ...overrides,
  });
  const ctx = { recordedAt: '2026-10-28', releaseDate: '2026-10' };

  it('groups units into one terminal per project and facility type, as live as its most live unit', () => {
    const { terminals } = lngTerminals(
      [
        unit(),
        unit({ UnitName: 'T2', Status: 'construction', CapacityinMtpa: 8, ActualStartYear: null, LatestPlannedStartYear: 2027, Latitude: 26, LastUpdated: '2026-09-01' }),
        unit({ UnitName: 'T3', Status: 'cancelled' }),
        unit({ UnitName: 'Regas', FacilityType: 'import', Status: 'proposed', CapacityinMtpa: null }),
      ],
      ctx,
    );
    expect(terminals.map((t) => t.id)).toEqual(['gem-t100-export', 'gem-t100-import']);
    expect(terminals[0]).toMatchObject({
      facility: 'export',
      country: 'QA',
      point: [51.55, 25.9],
      pointApprox: false,
      aliases: ['North Field LNG', 'RL'],
      owners: [{ name: 'QatarEnergy', sharePct: 70 }, { name: 'Shell', sharePct: 30 }],
      capacityMtpa: { operating: 7.8, planned: 8 },
      units: [
        { name: 'T1', status: 'operating', capacityMtpa: 7.8, startYear: 2010 },
        { name: 'T2', status: 'under_construction', capacityMtpa: 8, startYear: 2027 },
      ],
      evidence: [
        {
          status: 'operating',
          sourceType: 'dataset',
          statement: 'Global Energy Monitor: 1 unit operating, 1 under construction',
          observedAt: '2026-09-01',
        },
      ],
    });
    expect(terminals[1]).toMatchObject({ capacityMtpa: { operating: 0, planned: 0 }, evidence: [{ status: 'planned', observedAt: '2026-03-02' }] });
  });

  it('counts what it leaves out and the country names it cannot code', () => {
    const result = lngTerminals([unit({ Status: 'shelved' }), unit({ ProjectID: 'T2', 'Country/Area': 'Atlantis' })], ctx);
    expect(result.skipped).toEqual({ excluded_status: 1 });
    expect(result.unresolvedCountries).toEqual(['Atlantis']);
    expect(result.terminals[0]?.country).toBe('');
  });
});

describe('linkSendOut', () => {
  it('links terminals to their series, and refuses a link to a terminal GEM lacks', () => {
    const [a, b] = linkSendOut([lngTerminal({ id: 'gem-a' }), lngTerminal({ id: 'gem-b' })], new Map([['gem-a', 'alsi-gem-a']]));
    expect(a!.sendOutSeriesId).toBe('alsi-gem-a');
    expect(b).not.toHaveProperty('sendOutSeriesId');
    expect(() => linkSendOut([lngTerminal({ id: 'gem-a' })], new Map([['gem-z', 'alsi-gem-z']]))).toThrow(/gem-z/);
  });
});

describe('mergeLngEvidence', () => {
  const dataset = { status: 'operating' as const, sourceType: 'dataset' as const, observedAt: '2026-07-27', recordedAt: '2026-10-28' };
  const press = (status: 'offline' | 'reduced', observedAt: string) => ({ status, sourceType: 'press' as const, observedAt, recordedAt: '2026-10-29' });

  it('puts cited claims, newest first, ahead of the dataset claim', () => {
    const [merged, untouched] = mergeLngEvidence(
      [{ id: 'gem-a', evidence: [press('offline', '2026-03-19'), press('reduced', '2026-10-20')] }],
      [lngTerminal({ id: 'gem-a', evidence: [dataset] }), lngTerminal({ id: 'gem-b', evidence: [dataset] })],
    );
    expect(merged!.evidence.map((e) => `${e.status}@${e.observedAt}`)).toEqual([
      'reduced@2026-10-20',
      'offline@2026-03-19',
      'operating@2026-07-27',
    ]);
    expect(untouched!.evidence).toEqual([dataset]);
  });

  it('refuses evidence for a terminal that is not there', () => {
    expect(() => mergeLngEvidence([{ id: 'gem-x', evidence: [press('offline', '2026-03-19')] }], [lngTerminal()])).toThrow(/gem-x/);
  });
});
