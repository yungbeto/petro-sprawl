import { describe, expect, it } from 'vitest';
import { refineryRadiusPx, refineryStatus } from '../src/lib/encoding';
import { REFINERY_RADIUS } from '../src/lib/config';
import { kmBetween, pipelinesAtRefinery, refineriesAtPipeline, refineriesInPadd, refineryGroups } from '../src/lib/refineries';
import { brandOf, refineryTerms } from '../jobs/lib/news';
import { mergeRefineryEvidence, toEeaRefineries, withCuratedRefineries, type EeaRefinery } from '../jobs/lib/refineries';
import { formatRefineryCapacity } from '../src/lib/format';
import { curatedRefinerySchema } from '../jobs/lib/schemas';
import curatedRefineries from '../data/curated/refineries.json';
import type { Evidence, Pipeline, Refinery } from '../src/types';

const eia = (status: Evidence['status']): Evidence => ({
  status,
  sourceType: 'dataset',
  statement: 'EIA lists it.',
  observedAt: '2026-01-01',
  recordedAt: '2026-11-06',
});

const refinery = (id: string, over: Partial<Refinery> = {}): Refinery => ({
  id,
  name: id,
  aliases: [],
  country: 'US',
  point: [-95, 29.7],
  pointApprox: false,
  pointSource: 'eia',
  padd: 3,
  evidence: [eia('operating')],
  ...over,
});

const capacity = (value: number) => ({
  value,
  unit: 'b/cd' as const,
  asOf: '2026-01-01',
  source: { publisher: 'EIA', title: 't', url: 'https://www.eia.gov/', accessedAt: '2026-11-06' },
});

const pipeline = (id: string, coordinates: [number, number][], commodity: Pipeline['commodity'] = 'oil') =>
  ({ id, name: id, commodity, geometry: { type: 'LineString', coordinates }, sources: ['gem'] }) as unknown as Pipeline;

describe('refinery encoding', () => {
  it('takes the newest evidence status, unknown without any', () => {
    expect(refineryStatus(refinery('a', { evidence: [eia('idle')] }))).toBe('idle');
    expect(refineryStatus(refinery('a', { evidence: [] }))).toBe('unknown');
  });

  it('sizes by capacity within bounds, smallest when unknown', () => {
    expect(refineryRadiusPx(refinery('a'))).toBe(REFINERY_RADIUS.minPx);
    expect(refineryRadiusPx(refinery('a', { capacity: capacity(5_000_000) }))).toBe(REFINERY_RADIUS.maxPx);
    const mid = refineryRadiusPx(refinery('a', { capacity: capacity(250_000) }));
    expect(mid).toBeGreaterThan(REFINERY_RADIUS.minPx);
    expect(mid).toBeLessThan(REFINERY_RADIUS.maxPx);
  });
});

describe('refineryGroups', () => {
  const list = [
    refinery('small-gulf', { capacity: capacity(50_000) }),
    refinery('big-gulf', { capacity: capacity(500_000), corporation: 'Valero Energy Corp' }),
    refinery('west', { padd: 5, capacity: capacity(300_000), evidence: [eia('idle')], operator: 'Chevron USA' }),
  ];

  it('groups US refineries by PADD, largest group first, each largest first', () => {
    const groups = refineryGroups(list, 'region');
    expect(groups.map((g) => [g.id, g.capacity])).toEqual([
      ['padd-3', 550_000],
      ['padd-5', 300_000],
    ]);
    expect(groups[0]!.label).toBe('Gulf Coast (PADD 3)');
    expect(groups[0]!.refineries.map((r) => r.id)).toEqual(['big-gulf', 'small-gulf']);
  });

  it('groups by parent company, falling back to the operator, unknown last', () => {
    const groups = refineryGroups(list, 'company');
    expect(groups.map((g) => g.label)).toEqual(['Valero Energy Corp', 'Chevron USA', 'Company unknown']);
  });

  it('groups refineries outside the US by country', () => {
    const groups = refineryGroups([refinery('nl', { country: 'NL', padd: undefined })], 'region');
    expect(groups.map((g) => [g.id, g.label])).toEqual([['country-NL', 'Netherlands']]);
  });

  it('groups by status in the status order', () => {
    expect(refineryGroups(list, 'status').map((g) => g.id)).toEqual(['running', 'stopped']);
  });
});

describe('refinery links', () => {
  const at = refinery('r', { point: [-95, 29.7] });
  // 0.03 degrees of latitude is about 3.3 km; 0.1 about 11 km.
  const near = pipeline('near', [[-96, 30], [-95, 29.73]]);
  const far = pipeline('far', [[-96, 30], [-95, 29.8]]);
  const gas = pipeline('gas', [[-96, 30], [-95, 29.7]], 'gas');

  it('measures great-circle distance', () => {
    expect(kmBetween([0, 0], [0, 1])).toBeCloseTo(111.2, 0);
  });

  it('links oil and products pipelines with an end within the distance, never gas', () => {
    expect(pipelinesAtRefinery(at, [far, near, gas], 5).map((p) => p.id)).toEqual(['near']);
    expect(refineriesAtPipeline(near, [at], 5).map((r) => r.id)).toEqual(['r']);
    expect(refineriesAtPipeline(gas, [at], 5)).toEqual([]);
  });

  it("lists a region's refineries largest first", () => {
    const list = [refinery('a', { capacity: capacity(1) }), refinery('b', { capacity: capacity(2) }), refinery('c', { padd: 1 })];
    expect(refineriesInPadd(list, 3).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('refineryTerms', () => {
  it('takes the first word of a company, two when the second is a number', () => {
    expect(brandOf('Motiva Enterprises LLC')).toBe('Motiva');
    expect(brandOf('Phillips 66 Company')).toBe('Phillips 66');
  });

  it('ends every term in "refinery", and names the companies at a shared site', () => {
    const all = [
      refinery('superior', { name: 'Superior' }),
      refinery('pa-motiva', { name: 'Port Arthur (Motiva Enterprises)', operator: 'Motiva Enterprises LLC', corporation: 'Saudi Aramco' }),
      refinery('pa-premcor', { name: 'Port Arthur (Premcor Refining Group)', operator: 'Premcor Refining Group Inc', corporation: 'Valero Energy Corp' }),
    ];
    const terms = refineryTerms(all, all);
    expect(terms.filter((t) => t.ref === 'refinery/superior').map((t) => t.text)).toEqual(['Superior refinery']);
    expect(terms.filter((t) => t.ref === 'refinery/pa-premcor').map((t) => t.key)).toEqual([
      'premcor port arthur refinery',
      'premcor s port arthur refinery',
      'valero port arthur refinery',
      'valero s port arthur refinery',
    ]);
    expect(terms.some((t) => t.key === 'port arthur refinery')).toBe(false);
    expect(terms.every((t) => !t.weak)).toBe(true);
  });

  it('names the company for a curated refinery that shares its site with refineries not on the map', () => {
    const sarnia = refinery('ca-sarnia-suncor', { name: 'Sarnia (Suncor)', operator: 'Suncor Energy', sharedSite: true });
    expect(refineryTerms([sarnia], [sarnia]).map((t) => t.text)).toEqual(['Suncor Sarnia refinery', "Suncor's Sarnia refinery"]);
  });
});

describe('withCuratedRefineries', () => {
  const curated = refinery('in-jamnagar', { country: 'IN', point: [69.87, 22.35], pointSource: 'wikidata', padd: undefined, evidence: [] });

  it('adds curated refineries, replacing an imported one with the same id', () => {
    const out = withCuratedRefineries([curated], [refinery('a'), refinery('in-jamnagar', { point: [69.87, 22.35] })]);
    expect(out.map((r) => [r.id, r.pointSource])).toEqual([
      ['a', 'eia'],
      ['in-jamnagar', 'wikidata'],
    ]);
  });

  it('throws on a curated refinery beside an imported one under another id, or two with one id', () => {
    expect(() => withCuratedRefineries([curated], [refinery('eu-x', { point: [69.88, 22.35] })], 3)).toThrow(/in-jamnagar is within 3 km of eu-x/);
    expect(() => withCuratedRefineries([curated, curated], [])).toThrow(/share the id/);
  });

  it('keeps every curated record to its schema: a Wikidata point, a quoted capacity, no status yet', () => {
    expect(curatedRefineries.length).toBeGreaterThanOrEqual(20);
    for (const r of curatedRefineries) expect(curatedRefinerySchema.safeParse(r).success, r.id).toBe(true);
  });
});

describe('formatRefineryCapacity', () => {
  it('reads barrels a day, and million tonnes a year when that is the unit', () => {
    expect(formatRefineryCapacity({ value: 656_400 })).toBe('656,400 barrels a day');
    expect(formatRefineryCapacity({ value: 68.2, unit: 'Mt/yr' })).toBe('68.2 million tonnes a year');
  });
});

describe('mergeRefineryEvidence', () => {
  const press: Evidence = { ...eia('offline'), sourceType: 'press', url: 'https://example.com/a', observedAt: '2026-10-01' };

  it("puts cited claims before EIA's dataset status", () => {
    const [merged] = mergeRefineryEvidence([{ id: 'r', evidence: [press] }], [refinery('r')]);
    expect(merged!.evidence.map((e) => e.sourceType)).toEqual(['press', 'dataset']);
  });

  it("throws on a claim for a refinery that isn't there", () => {
    expect(() => mergeRefineryEvidence([{ id: 'gone', evidence: [press] }], [refinery('r')])).toThrow(/gone/);
  });
});

describe('toEeaRefineries', () => {
  const row = (over: Partial<EeaRefinery> = {}): EeaRefinery => ({
    inspireId: 'NL.RIVM/1.FACILITY',
    name: 'Shell Nederland Raffinaderij B.V.',
    parentCompany: 'SHELL NEDERLAND RAFFINADERIJ B.V.',
    country: 'NL',
    city: 'Rotterdam',
    lat: 51.88,
    lon: 4.36,
    reportingYear: 2024,
    ...over,
  });

  it('keeps the status unknown, with the register line as dataset evidence and no capacity', () => {
    const [r] = toEeaRefineries([row()], { today: '2026-11-06' });
    expect(r).toMatchObject({ id: 'eu-nl-shell-nederland-raffinaderij-b-v', country: 'NL', pointSource: 'eea', point: [4.36, 51.88] });
    expect(r!.capacity).toBeUndefined();
    expect(r!.evidence).toEqual([expect.objectContaining({ status: 'unknown', sourceType: 'dataset', observedAt: '2024-12-31' })]);
    expect(r!.corporation).toBe('Shell Nederland Raffinaderij B.V.');
  });

  it('reads capitals as a name, with joining words in lower case', () => {
    expect(toEeaRefineries([row({ name: 'RAFFINERIA DI TARANTO' })], { today: '2026-11-06' })[0]!.name).toBe('Raffineria di Taranto');
  });

  it("maps the register's codes for Greece and the UK, and adds the city where names repeat", () => {
    const rows = [row({ country: 'EL', name: 'MOTOR OIL', city: 'Korinthos' }), row({ country: 'EL', name: 'Motor Oil', city: 'Aspropyrgos' })];
    const out = toEeaRefineries(rows, { today: '2026-11-06' });
    expect(out.map((r) => [r.country, r.name, r.id])).toEqual([
      ['GR', 'Motor Oil (Korinthos)', 'eu-gr-motor-oil-korinthos'],
      ['GR', 'Motor Oil (Aspropyrgos)', 'eu-gr-motor-oil-aspropyrgos'],
    ]);
  });
});
