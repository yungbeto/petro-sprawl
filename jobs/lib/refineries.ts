// US refineries (SPEC M11 phase 1): EIA's 2026 capacities placed at the points of EIA's 2021 refinery
// shapefile. Pure, so it's tested (tests/refineries.test.ts).

import { REFINERIES } from '../../src/lib/config';
import type { AssetStatus, Evidence, Refinery } from '../../src/types';

/** One site from data/derived/eia-refineries.json (jobs/import-refineries-us.py). Barrels per calendar day. */
export interface EiaRefinery {
  corporation: string;
  company: string;
  site: string;
  state: string;
  padd: number;
  operable: number;
  operating: number;
  idle: number;
}

/** One point of the 2021 shapefile. */
export interface EiaRefineryPoint {
  company: string;
  site: string;
  state: string;
  point: [number, number];
}

/** Letters and digits only, upper case: "New Castle" and "NEWCASTLE" are one site. */
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface Placement {
  refinery: EiaRefinery;
  point: EiaRefineryPoint;
  /** How the point was chosen: the only one at the site, the same company, the company's first word, or the one left at the site. */
  by: 'site' | 'company' | 'first word' | 'elimination';
}

/**
 * Places each refinery at a 2021 point at the same site and state: the only point there; else the point with
 * the same company; else the only point there whose company starts with the same word ("Hartree Refining LLC",
 * "Hartree Channelview LLC"); else, when one refinery and one point are left at the site, that point (owners
 * change names, the plants stay). Anything else is left unplaced: a point is never guessed.
 */
export function placeRefineries(refineries: readonly EiaRefinery[], points: readonly EiaRefineryPoint[]): { placed: Placement[]; unplaced: EiaRefinery[] } {
  const siteOf = (site: string, state: string) => `${key(site)}|${key(state)}`;
  const groups = new Map<string, { refineries: EiaRefinery[]; points: EiaRefineryPoint[] }>();
  const group = (k: string) => groups.get(k) ?? (groups.set(k, { refineries: [], points: [] }), groups.get(k)!);
  for (const r of refineries) group(siteOf(r.site, r.state)).refineries.push(r);
  for (const p of points) group(siteOf(p.site, p.state)).points.push(p);
  const placed: Placement[] = [];
  const unplaced: EiaRefinery[] = [];
  for (const g of groups.values()) {
    if (!g.refineries.length) continue;
    if (g.points.length === 1 && g.refineries.length === 1) {
      placed.push({ refinery: g.refineries[0]!, point: g.points[0]!, by: 'site' });
      continue;
    }
    let left = [...g.refineries];
    let free = [...g.points];
    for (const r of g.refineries) {
      const same = free.filter((p) => key(p.company) === key(r.company));
      if (same.length !== 1) continue;
      placed.push({ refinery: r, point: same[0]!, by: 'company' });
      left = left.filter((x) => x !== r);
      free = free.filter((p) => p !== same[0]);
    }
    const firstWord = (company: string) => company.toUpperCase().split(/[^A-Z0-9]+/).find(Boolean) ?? '';
    for (const r of [...left]) {
      const same = free.filter((p) => firstWord(p.company) === firstWord(r.company));
      if (same.length !== 1 || left.filter((x) => firstWord(x.company) === firstWord(r.company)).length !== 1) continue;
      placed.push({ refinery: r, point: same[0]!, by: 'first word' });
      left = left.filter((x) => x !== r);
      free = free.filter((p) => p !== same[0]);
    }
    if (left.length === 1 && free.length === 1) {
      placed.push({ refinery: left[0]!, point: free[0]!, by: 'elimination' });
      left = [];
    }
    unplaced.push(...left);
  }
  return { placed, unplaced };
}

/** EIA's split as a status (SPEC M11): all idle is idle, part idle is reduced, none idle is operating. */
export function eiaStatus(r: Pick<EiaRefinery, 'operable' | 'idle'>): AssetStatus {
  if (r.operable > 0 && r.idle >= r.operable) return 'idle';
  return r.idle > 0 ? 'reduced' : 'operating';
}

const SMALL = new Set(['and', 'of', 'the']);
const KEEP = new Set(['LLC', 'LP', 'USA', 'US', 'II', 'III', 'HF', 'BP', 'CPI', 'PBF', 'CHS', 'ARG', 'NA']);

/** EIA's capitals as a name: "EXXONMOBIL REFINING & SUPPLY CO" -> "Exxonmobil Refining & Supply Co". */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      if (KEEP.has(w.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.replace(/(^|[-/'.])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
    })
    .join(' ');
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const LEGAL = /\b(llc|l\.l\.c|lp|inc|co|corp|corporation|company|ltd)\.?$/i;
/** The company without its legal form, for a name and an id: "Valero Refining Co Texas LP" -> "Valero Refining Co Texas". */
const shortCompany = (company: string) => {
  let name = titleCase(company);
  while (LEGAL.test(name)) name = name.replace(LEGAL, '').trim();
  return name;
};

/**
 * Refinery records, named by site (with the company where EIA lists more than one at the site, placed or not,
 * so a name and id don't change when another gets a point), largest first.
 */
export function toRefineries(
  placed: readonly Placement[],
  { asOf, today, all = placed.map((p) => p.refinery) }: { asOf: string; today: string; all?: readonly EiaRefinery[] },
): Refinery[] {
  const perSite = new Map<string, number>();
  for (const r of all) perSite.set(`${key(r.site)}|${key(r.state)}`, (perSite.get(`${key(r.site)}|${key(r.state)}`) ?? 0) + 1);
  const year = asOf.slice(0, 4);
  const source = { publisher: 'EIA', title: REFINERIES.eiaTitle, url: REFINERIES.eiaPage, accessedAt: today };
  return placed
    .map(({ refinery: r, point }) => {
      const shared = (perSite.get(`${key(r.site)}|${key(r.state)}`) ?? 0) > 1;
      const site = titleCase(r.site);
      const status = eiaStatus(r);
      const split =
        status === 'operating'
          ? `all ${r.operable.toLocaleString('en-US')} barrels a day of crude distillation capacity operating`
          : status === 'idle'
            ? `all ${r.operable.toLocaleString('en-US')} barrels a day of crude distillation capacity idle`
            : `${r.idle.toLocaleString('en-US')} of ${r.operable.toLocaleString('en-US')} barrels a day of crude distillation capacity idle`;
      const evidence: Evidence = {
        status,
        sourceType: 'dataset',
        statement: `EIA lists ${split} on 1 January ${year}.`,
        url: REFINERIES.eiaPage,
        observedAt: asOf,
        recordedAt: today,
      };
      const refinery: Refinery = {
        id: slug(`us ${r.state} ${r.site}${shared ? ` ${shortCompany(r.company)}` : ''}`),
        name: shared ? `${site} (${shortCompany(r.company)})` : site,
        aliases: [titleCase(r.company)],
        country: 'US',
        point: point.point,
        pointApprox: false,
        pointSource: 'eia',
        operator: titleCase(r.company),
        corporation: titleCase(r.corporation),
        capacity: { value: r.operable, unit: 'b/cd', asOf, source },
        padd: r.padd as Refinery['padd'],
        state: r.state,
        evidence: [evidence],
      };
      return refinery;
    })
    .sort((a, b) => (b.capacity?.value ?? 0) - (a.capacity?.value ?? 0) || a.id.localeCompare(b.id));
}
