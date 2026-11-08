import { describe, expect, it } from 'vitest';
import { FIELD_MARKER } from '../src/lib/config';
import { fieldGroups, fieldLead, fieldRadiusPx, fieldScale, fieldsInBasin, formatFieldOutput, pipelinesNearField } from '../src/lib/fields';
import type { Field, FieldOutput, Pipeline } from '../src/types';

const field = (id: string, output: FieldOutput[], over: Partial<Field> = {}): Field => ({
  id,
  name: id,
  aliases: [],
  level: 'field',
  country: 'NO',
  point: [0, 0],
  pointApprox: false,
  fuel: 'oil and gas',
  location: 'offshore',
  output,
  gemUrl: `https://www.gem.wiki/${id}`,
  evidence: [{ status: 'operating', sourceType: 'dataset', observedAt: '2026-03', recordedAt: '2026-11-07' }],
  ...over,
});
const oil = (value: number, year = 2024): FieldOutput => ({ fuel: 'oil', value, unit: 'million bbl/y', year });
const gas = (value: number, year = 2024): FieldOutput => ({ fuel: 'gas', value, unit: 'million m³/y', year });

describe('field size', () => {
  const fields = [field('a', [oil(100)]), field('b', [gas(1000)]), field('c', [oil(10), gas(900)]), field('d', [])];
  const scale = fieldScale(fields);

  it('takes each unit apart, never converting gas into oil', () => {
    expect(scale['million bbl/y']).toBe(10);
    expect(scale['million m³/y']).toBe(900);
  });

  it('leads with whichever figure is larger against its own unit', () => {
    const big = fieldScale([field('a', [oil(100)]), field('b', [gas(1000)])]);
    expect(fieldLead(field('c', [oil(10), gas(900)]), big)?.output.fuel).toBe('gas');
    expect(fieldLead(field('d', []), big)).toBeNull();
  });

  it('draws a field with no figure at the smallest size and caps the largest', () => {
    expect(fieldRadiusPx(fields[3]!, scale)).toBe(FIELD_MARKER.minPx);
    expect(fieldRadiusPx(fields[0]!, scale)).toBe(FIELD_MARKER.maxPx);
  });
});

describe('formatFieldOutput', () => {
  it('names the fuel and keeps the unit, with sensible digits', () => {
    expect(formatFieldOutput(oil(365))).toBe('Oil, 365 million barrels a year');
    expect(formatFieldOutput(gas(8.771))).toBe('Gas, 8.77 million m³ a year');
  });
});

describe('fieldGroups', () => {
  it('groups by country, the most fields first, each largest first', () => {
    const fields = [field('n1', [oil(1)]), field('n2', [oil(5)]), field('q1', [gas(50)], { country: 'QA' })];
    const groups = fieldGroups(fields, 'country', fieldScale(fields));
    expect(groups.map((g) => g.id)).toEqual(['country-NO', 'country-QA']);
    expect(groups[0]!.fields.map((f) => f.id)).toEqual(['n2', 'n1']);
  });
});

describe('links', () => {
  const line = (commodity: Pipeline['commodity'], start: [number, number]): Pipeline => ({
    id: `p-${commodity}`,
    name: `${commodity} line`,
    aliases: [],
    commodity,
    fromCountry: 'NO',
    toCountry: 'GB',
    transitCountries: [],
    geometry: { type: 'LineString', coordinates: [start, [5, 5]] },
    geometryApprox: false,
    evidence: [],
    sources: [],
  });

  it('lists lines of a fuel the field produces with an end within reach', () => {
    const near: [number, number] = [0.05, 0];
    const lines = [line('gas', near), line('oil', near), line('products', near), line('gas', [3, 3])];
    expect(pipelinesNearField(field('g', [], { fuel: 'gas' }), lines).map((p) => p.commodity)).toEqual(['gas']);
    expect(pipelinesNearField(field('o', [], { fuel: 'oil' }), lines).map((p) => p.commodity)).toEqual(['oil']);
  });

  it("finds a province's fields by the province GEM's point falls in", () => {
    const fields = [field('in', [oil(2)], { provinceId: 'usgs-1' }), field('out', [oil(9)], { provinceId: 'usgs-2' })];
    expect(fieldsInBasin({ id: 'usgs-1' }, fields, fieldScale(fields)).map((f) => f.id)).toEqual(['in']);
  });
});
