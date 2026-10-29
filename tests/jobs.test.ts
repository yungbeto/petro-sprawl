import { describe, expect, it } from 'vitest';
import { mergeBasinCountries, toBasin } from '../jobs/lib/basins';
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
import { gemRowToPipeline, joinLineParts, mapGemStatus, parseOwners, type GemRow } from '../jobs/lib/gem';

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
