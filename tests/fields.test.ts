import { describe, expect, it } from 'vitest';
import { fieldCore, fieldTerms, matchAssets } from '../jobs/lib/news';
import type { Field } from '../src/types';
import { fieldName, fieldOutputs, mapGogetStatus, mergeFieldEvidence, parseYear, projectOutputs, toFields, type GogetRows } from '../jobs/lib/fields';

const field = (id: string, over: Record<string, string> = {}) => ({
  'Unit ID': id,
  'Unit Name': `Field ${id} Oil Field (Norway)`,
  'Fuel type': 'oil',
  'Country/Area': 'Norway',
  Status: 'operating',
  'Status year': '2024.0',
  'Wiki URL (field)': `https://www.gem.wiki/${id}`,
  Latitude: '60.123456',
  Longitude: '2.5',
  'Location accuracy': 'exact',
  'Onshore/Offshore': 'offshore',
  ...over,
});
const rows = (over: Partial<GogetRows> = {}): GogetRows => ({ source: 'x.xlsx', sha256: 'abc', fields: [], fieldOutput: [], projects: [], projectOutput: [], ...over });
const ctx = { recordedAt: '2026-11-07' };

describe('small parsers', () => {
  it('maps GEM extraction statuses, keeping unknown for anything else', () => {
    expect(mapGogetStatus('operating')).toBe('operating');
    expect(mapGogetStatus('in-development')).toBe('under_construction');
    expect(mapGogetStatus('Mothballed')).toBe('idle');
    expect(mapGogetStatus('abandoned')).toBe('offline');
    expect(mapGogetStatus('decommissioning')).toBe('offline');
    expect(mapGogetStatus(undefined)).toBe('unknown');
  });

  it('drops the place in brackets from a name', () => {
    expect(fieldName('Kashagan Oil and Gas Field (Kazakhstan)')).toBe('Kashagan Oil and Gas Field');
    expect(fieldName('Cold Lake Oil Asset (Alberta, Canada)')).toBe('Cold Lake Oil Asset');
    expect(fieldName('(Kazakhstan)')).toBe('(Kazakhstan)');
  });

  it("reads GEM's years written as decimals", () => {
    expect(parseYear('2023.0')).toBe(2023);
    expect(parseYear('')).toBeUndefined();
    expect(parseYear('n/a')).toBeUndefined();
  });
});

describe('fieldOutputs', () => {
  it('keeps the newest year per fuel, never adding fuels together', () => {
    const out = fieldOutputs([
      { 'Unit ID': 'A', 'Fuel description': 'oil', 'Quantity (converted)': '10', 'Units (converted)': 'million bbl/y', 'Data Year': '2022.0' },
      { 'Unit ID': 'A', 'Fuel description': 'oil', 'Quantity (converted)': '12', 'Units (converted)': 'million bbl/y', 'Data Year': '2024.0' },
      { 'Unit ID': 'A', 'Fuel description': 'gas', 'Quantity (converted)': '500', 'Units (converted)': 'million m³/y', 'Data Year': '2023.0' },
    ]);
    expect(out.get('A')).toEqual([
      { fuel: 'oil', value: 12, unit: 'million bbl/y', year: 2024 },
      { fuel: 'gas', value: 500, unit: 'million m³/y', year: 2023 },
    ]);
  });

  it('skips units it does not know and reports a second figure for the same year', () => {
    const duplicates: string[] = [];
    const out = fieldOutputs(
      [
        { 'Unit ID': 'A', 'Fuel description': 'oil', 'Quantity (converted)': '10', 'Units (converted)': 'million bbl/y', 'Data Year': '2024.0' },
        { 'Unit ID': 'A', 'Fuel description': 'oil', 'Quantity (converted)': '11', 'Units (converted)': 'million bbl/y', 'Data Year': '2024.0' },
        { 'Unit ID': 'A', 'Fuel description': 'gas', 'Quantity (converted)': '3', 'Units (converted)': 'bcf/d', 'Data Year': '2024.0' },
      ],
      duplicates,
    );
    expect(out.get('A')).toEqual([{ fuel: 'oil', value: 10, unit: 'million bbl/y', year: 2024 }]);
    expect(duplicates).toEqual(['A oil 2024']);
  });

  it("marks a project figure that is GEM's own sum of its fields, with no year", () => {
    const out = projectOutputs([
      { 'Project ID': 'P', 'Fuel description': 'oil', 'Quantity (converted)': '5', 'Units (converted)': 'million bbl/y', 'Data source type': 'production summed from fields' },
    ]);
    expect(out.get('P')).toEqual([{ fuel: 'oil', value: 5, unit: 'million bbl/y', summedByGem: true }]);
  });
});

describe('toFields', () => {
  it('turns a field row into a record with GEM status as dataset evidence', () => {
    const { fields } = toFields(rows({ fields: [field('L1')] }), ctx);
    expect(fields).toHaveLength(1);
    const f = fields[0]!;
    expect(f).toMatchObject({ id: 'gem-l1', name: 'Field L1 Oil Field', level: 'field', country: 'NO', point: [2.5, 60.1235], pointApprox: false, location: 'offshore' });
    expect(f.evidence).toEqual([
      {
        status: 'operating',
        sourceType: 'dataset',
        statement: 'Global Energy Monitor lists it as operating, from a source dated 2024.',
        url: 'https://www.gem.wiki/L1',
        observedAt: '2026-03',
        recordedAt: '2026-11-07',
      },
    ]);
  });

  it('leaves out discovered, cancelled and storage units, and reports fields with no point', () => {
    const { fields, skipped, unplaced } = toFields(
      rows({
        fields: [field('L1', { Status: 'discovered' }), field('L2', { Status: 'underground gas storage' }), field('L3', { Latitude: '', Longitude: '' }), field('L4')],
      }),
      ctx,
    );
    expect(fields.map((f) => f.id)).toEqual(['gem-l4']);
    expect(skipped).toEqual({ 'status discovered': 1, 'status underground gas storage': 1 });
    expect(unplaced).toEqual(['Field L3 Oil Field (Norway, field L3)']);
  });

  it('folds a placed project over its fields, keeping their own figures and years', () => {
    const project = {
      'Project ID': 'P1',
      'Project Name': 'Big Oil Project (Norway)',
      'Fuel type': 'oil and gas',
      'Country/Area': 'Norway',
      Status: 'operating',
      'Units (list of IDs)': 'P1, L1, L9',
      'Wiki URL (project)': 'https://www.gem.wiki/P1',
      Latitude: '61',
      Longitude: '3',
      'Location accuracy': 'exact',
    };
    const { fields } = toFields(
      rows({
        fields: [field('L1'), field('L2')],
        fieldOutput: [{ 'Unit ID': 'L1', 'Fuel description': 'oil', 'Quantity (converted)': '7', 'Units (converted)': 'million bbl/y', 'Data Year': '2024.0' }],
        projects: [project],
        projectOutput: [{ 'Project ID': 'P1', 'Fuel description': 'oil', 'Quantity (converted)': '9', 'Units (converted)': 'million bbl/y', 'Data source type': 'project level production' }],
      }),
      ctx,
    );
    expect(fields.map((f) => f.id)).toEqual(['gem-p1', 'gem-l2']);
    const p = fields[0]!;
    expect(p.level).toBe('project');
    expect(p.output).toEqual([{ fuel: 'oil', value: 9, unit: 'million bbl/y' }]);
    expect(p.parts).toEqual([{ id: 'gem-l1', name: 'Field L1 Oil Field', status: 'operating', output: [{ fuel: 'oil', value: 7, unit: 'million bbl/y', year: 2024 }] }]);
  });

  it('lets a project with no point leave its fields standing alone', () => {
    const project = { 'Project ID': 'P1', 'Project Name': 'Big (Norway)', 'Fuel type': 'oil', 'Country/Area': 'Norway', 'Units (list of IDs)': 'L1', 'Wiki URL (project)': 'https://www.gem.wiki/P1' };
    const { fields, unplaced } = toFields(rows({ fields: [field('L1')], projects: [project] }), ctx);
    expect(fields.map((f) => f.id)).toEqual(['gem-l1']);
    expect(unplaced).toEqual(['Big (Norway, project P1)']);
  });

  it('keeps the first country of a unit across a border and says when GEM gives no status', () => {
    const { fields } = toFields(rows({ fields: [field('L1', { 'Country/Area': 'Saudi Arabia; Kuwait', Status: '' })] }), ctx);
    expect(fields[0]!.country).toBe('SA');
    expect(fields[0]!.evidence[0]).toMatchObject({ status: 'unknown', statement: 'Global Energy Monitor gives no status.' });
  });
});

describe('mergeFieldEvidence', () => {
  const [base] = toFields(rows({ fields: [field('L1', { Status: 'mothballed' })] }), ctx).fields;
  const claim = { status: 'offline' as const, sourceType: 'government' as const, statement: 'Closed for good.', url: 'https://example.gov/x', observedAt: '2024-10-01', recordedAt: '2026-11-07' };

  it('puts a cited claim ahead of the listing', () => {
    const [merged] = mergeFieldEvidence([{ id: 'gem-l1', evidence: [claim] }], [base!]);
    expect(merged!.evidence.map((e) => e.sourceType)).toEqual(['government', 'dataset']);
  });

  it('throws when a claim names a field that is not there', () => {
    expect(() => mergeFieldEvidence([{ id: 'gem-l2', evidence: [claim] }], [base!])).toThrow(/gem-l2/);
  });
});

describe('news terms', () => {
  const f = (id: string, name: string, over: Partial<Field> = {}) =>
    ({ id, name, aliases: [], fuel: 'oil and gas', ...over }) as Pick<Field, 'id' | 'name' | 'aliases' | 'fuel' | 'parts'>;

  it("strips GEM's description from a name", () => {
    expect(fieldCore('Kashagan Oil and Gas Field')).toBe('Kashagan');
    expect(fieldCore('El Sharara Oil Field')).toBe('El Sharara');
    expect(fieldCore('Tengiz FGP Oil and Gas Phase')).toBe('Tengiz FGP');
    expect(fieldCore('North Field Oil and Gas Project')).toBe('North Field');
    expect(fieldCore('10097UUU/Athabasca Oil Asset')).toBe('Athabasca');
  });

  it('makes "<name> field" strong and the name alone weak', () => {
    const terms = fieldTerms([f('a', 'El Sharara Oil Field', { fuel: 'oil' })], []);
    expect(terms.map((t) => [t.text, t.weak])).toEqual([
      ['El Sharara field', false],
      ['El Sharara oilfield', false],
      ['El Sharara', true],
    ]);
  });

  it("gives a project its fields' names, and leaves out a name two fields share", () => {
    const project = f('p', 'North Caspian Oil and Gas Project', { parts: [{ id: 'k', name: 'Kashagan Oil and Gas Field', output: [] }] });
    const all = [project, f('x', '10097UUU/Athabasca Oil Asset'), f('y', '10419YY/Athabasca Oil Asset')];
    const texts = fieldTerms([project, all[1]!], all).map((t) => t.text);
    expect(texts).toContain('Kashagan field');
    expect(texts).toContain('North Caspian gas field');
    expect(texts.some((t) => t.startsWith('Athabasca'))).toBe(false);
  });

  it('matches a weak name only beside an energy word', () => {
    const terms = fieldTerms([f('a', 'El Sharara Oil Field', { fuel: 'oil' })], []);
    expect(matchAssets('Protesters shut El Sharara oilfield', terms)).toEqual(['field/a']);
    expect(matchAssets('El Sharara output resumes', terms)).toEqual(['field/a']);
    expect(matchAssets('A festival in El Sharara', terms)).toEqual([]);
  });
});
