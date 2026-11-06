import { describe, expect, it } from 'vitest';
import { eiaStatus, placeRefineries, titleCase, toRefineries, type EiaRefinery, type EiaRefineryPoint } from '../jobs/lib/refineries';

const site = (company: string, siteName: string, state = 'Texas', over: Partial<EiaRefinery> = {}): EiaRefinery => ({
  corporation: company,
  company,
  site: siteName,
  state,
  padd: 3,
  operable: 100_000,
  operating: 100_000,
  idle: 0,
  ...over,
});
const point = (company: string, siteName: string, state = 'Texas', x = 0): EiaRefineryPoint => ({ company, site: siteName, state, point: [x, 30] });

describe('placeRefineries', () => {
  it('places a lone refinery at its site, ignoring spaces and case', () => {
    const { placed, unplaced } = placeRefineries([site('WYOMING REFINING CO', 'NEWCASTLE', 'Wyoming')], [point('HERMES CONSOLIDATED LLC', 'New Castle', 'Wyoming')]);
    expect(placed.map((p) => p.by)).toEqual(['site']);
    expect(unplaced).toEqual([]);
  });

  it('matches a shared site by company, then pairs the one left over', () => {
    const toledo = [site('TOLEDO REFINING CO LLC', 'TOLEDO', 'Ohio'), site('OHIO REFINING COMPANY LLC', 'TOLEDO', 'Ohio')];
    const points = [point('BP-HUSKY REFINING LLC', 'Toledo', 'Ohio', 1), point('TOLEDO REFINING CO LLC', 'Toledo', 'Ohio', 2)];
    const { placed } = placeRefineries(toledo, points);
    const at = Object.fromEntries(placed.map((p) => [p.refinery.company, [p.by, p.point.point[0]]]));
    expect(at).toEqual({ 'TOLEDO REFINING CO LLC': ['company', 2], 'OHIO REFINING COMPANY LLC': ['elimination', 1] });
  });

  it("matches by the company's first word when only one point there shares it", () => {
    const { placed } = placeRefineries(
      [site('HARTREE REFINING LLC', 'CHANNELVIEW')],
      [point('EQUISTAR CHEMICALS LP', 'Channelview', 'Texas', 1), point('HARTREE CHANNELVIEW LLC', 'Channelview', 'Texas', 2)],
    );
    expect(placed.map((p) => [p.by, p.point.point[0]])).toEqual([['first word', 2]]);
  });

  it("never guesses: two unmatched at a site, or none, stay unplaced", () => {
    const houston = [site('PETROMAX REFINING CO LLC', 'HOUSTON'), site('NEW OWNER LLC', 'HOUSTON')];
    const points = [point('HOUSTON REFINING LP', 'Houston', 'Texas', 1), point('OTHER LP', 'Houston', 'Texas', 2)];
    expect(placeRefineries(houston, points).unplaced).toHaveLength(2);
    expect(placeRefineries([site('TEXAS INTERNATIONAL TERMINALS', 'GALVESTON')], []).unplaced).toHaveLength(1);
  });
});

describe('refinery records', () => {
  it("reads EIA's split as a status", () => {
    expect(eiaStatus({ operable: 245_271, idle: 0 })).toBe('operating');
    expect(eiaStatus({ operable: 180_000, idle: 32_000 })).toBe('reduced');
    expect(eiaStatus({ operable: 2_000, idle: 2_000 })).toBe('idle');
  });

  it('writes names in title case, keeping abbreviations', () => {
    expect(titleCase('EXXONMOBIL REFINING & SUPPLY CO')).toBe('Exxonmobil Refining & Supply Co');
    expect(titleCase('HF SINCLAIR PUGET SOUND REFG LLC')).toBe('HF Sinclair Puget Sound Refg LLC');
    expect(titleCase('SAINT PAUL')).toBe('Saint Paul');
  });

  it('names a refinery by site, with its company where the site is shared, largest first, with dated evidence', () => {
    const { placed } = placeRefineries(
      [
        site('VALERO REFINING CO TEXAS LP', 'HOUSTON', 'Texas', { operable: 215_000, operating: 215_000 }),
        site('PETROMAX REFINING CO LLC', 'HOUSTON', 'Texas', { operable: 25_000, operating: 0, idle: 25_000 }),
        site('EXXONMOBIL REFINING & SUPPLY CO', 'BAYTOWN', 'Texas', { operable: 564_500, operating: 564_500 }),
      ],
      [point('VALERO REFINING CO TEXAS LP', 'Houston'), point('PETROMAX REFINING CO LLC', 'Houston'), point('EXXONMOBIL REFINING & SUPPLY CO', 'Baytown')],
    );
    const out = toRefineries(placed, { asOf: '2026-01-01', today: '2026-11-06' });
    expect(out.map((r) => [r.id, r.name])).toEqual([
      ['us-texas-baytown', 'Baytown'],
      ['us-texas-houston-valero-refining-co-texas', 'Houston (Valero Refining Co Texas)'],
      ['us-texas-houston-petromax-refining', 'Houston (Petromax Refining)'],
    ]);
    expect(out[0]!.capacity).toMatchObject({ value: 564_500, unit: 'b/cd', asOf: '2026-01-01' });
    expect(out[2]!.evidence[0]).toMatchObject({ status: 'idle', sourceType: 'dataset', observedAt: '2026-01-01' });
    expect(out[2]!.evidence[0]!.statement).toBe('EIA lists all 25,000 barrels a day of crude distillation capacity idle on 1 January 2026.');
  });
});
