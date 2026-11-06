// US refineries (SPEC M11 phase 1): EIA's 2026 capacities placed at the points of EIA's 2021 refinery
// shapefile. Pure, so it's tested (tests/refineries.test.ts).

import { REFINERIES } from '../../src/lib/config';
import type { AssetStatus, Evidence, Refinery } from '../../src/types';
import { byRankThenObservedDesc } from './curated-pipelines';
import { kmBetween } from '../../src/lib/refineries';

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

/** Cited claims for one refinery (data/curated/refinery-evidence.json), by its id. */
export interface CuratedRefineryEvidence {
  id: string;
  evidence: Evidence[];
}

/**
 * Adds each record's claims to its refinery, ranked like pipeline evidence (cited claims before the
 * dataset's, then newest). Throws on an id that isn't there, so a renamed refinery can't drop its claims.
 */
export function mergeRefineryEvidence(curated: readonly CuratedRefineryEvidence[], refineries: readonly Refinery[]): Refinery[] {
  const byId = new Map(curated.map((c) => [c.id, c.evidence]));
  const missing = [...byId.keys()].filter((id) => !refineries.some((r) => r.id === id));
  if (missing.length) throw new Error(`curated refinery evidence points at refineries that don't exist: ${missing.join(', ')}`);
  return refineries.map((r) => {
    const cited = byId.get(r.id);
    return cited ? { ...r, evidence: [...cited, ...r.evidence].sort(byRankThenObservedDesc) } : r;
  });
}

/**
 * Adds the curated refineries (phase 3) to the imported ones. A curated record with an imported refinery's id
 * replaces it (curated wins); one within REFINERIES.sameSiteKm of an imported refinery under another id is the
 * same plant twice, and throws, as do two curated records with one id.
 */
export function withCuratedRefineries(curated: readonly Refinery[], imported: readonly Refinery[], sameSiteKm: number = REFINERIES.sameSiteKm): Refinery[] {
  const ids = new Set<string>();
  for (const c of curated) {
    if (ids.has(c.id)) throw new Error(`two curated refineries share the id ${c.id}`);
    ids.add(c.id);
  }
  const kept = imported.filter((r) => !ids.has(r.id));
  const twins = curated.flatMap((c) =>
    kept.filter((r) => kmBetween(r.point, c.point) <= sameSiteKm).map((r) => `${c.id} is within ${sameSiteKm} km of ${r.id}`),
  );
  if (twins.length) throw new Error(`curated refineries already imported: ${twins.join('; ')}`);
  return [...kept, ...curated];
}

/** A refinery as the EEA register lists it (jobs/import-refineries-eu.py). */
export interface EeaRefinery {
  inspireId: string;
  name: string;
  parentCompany: string | null;
  /** The register's country code: EL is Greece, UK the United Kingdom. */
  country: string;
  city: string | null;
  lat: number;
  lon: number;
  reportingYear: number;
}

const EEA_COUNTRY: Record<string, string> = { EL: 'GR', UK: 'GB' };

/** Joining words in the register's languages stay lower case inside a name: "Raffineria di Taranto". */
const EU_SMALL = new Set(['di', 'de', 'del', 'della', 'des', 'du', 'la', 'le', 'y', 'e', 'et', 'und', 'van', 'der', 'den', 'nad', 'w', 'u']);

/** Names the register gives in capitals read as names; mixed case is kept as reported. */
const asName = (s: string) =>
  s === s.toUpperCase()
    ? titleCase(s)
        .split(' ')
        .map((w, i) => (i > 0 && EU_SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w))
        .join(' ')
    : s.trim().replace(/\s+/g, ' ');

/**
 * Refinery records from the EEA register. The register says a site is permitted and reporting, not that
 * it's running, so the status is unknown until a claim gives one (SPEC M11); the register's line is kept as
 * dataset evidence. It gives no capacity. Ids are country and name, with the city where two share a name.
 */
export function toEeaRefineries(rows: readonly EeaRefinery[], { today }: { today: string }): Refinery[] {
  const ids = rows.map((r) => slug(`eu ${EEA_COUNTRY[r.country] ?? r.country} ${asName(r.name)}`));
  const taken = new Map<string, number>();
  for (const id of ids) taken.set(id, (taken.get(id) ?? 0) + 1);
  return rows.map((r, i) => {
    const country = EEA_COUNTRY[r.country] ?? r.country;
    const repeated = taken.get(ids[i]!)! > 1;
    const city = r.city ? asName(r.city) : null;
    // A company's name on several sites ("TotalEnergies Raffinage France") says which one by its town.
    const name = repeated && city ? `${asName(r.name)} (${city})` : asName(r.name);
    const company = r.parentCompany ? asName(r.parentCompany) : undefined;
    const id = repeated ? slug(`${ids[i]} ${city ?? r.inspireId}`) : ids[i]!;
    const refinery: Refinery = {
      id,
      name,
      aliases: company && company !== name ? [company] : [],
      country,
      point: [Number(r.lon.toFixed(5)), Number(r.lat.toFixed(5))],
      pointApprox: false,
      pointSource: 'eea',
      ...(company ? { corporation: company } : {}),
      evidence: [
        {
          status: 'unknown',
          sourceType: 'dataset',
          statement: `The EEA's industrial register lists it as a functional refinery in its ${r.reportingYear} report: a permit, not a sign it's running.`,
          url: REFINERIES.eeaPage,
          observedAt: `${r.reportingYear}-12-31`,
          recordedAt: today,
        },
      ],
    };
    return refinery;
  });
}
