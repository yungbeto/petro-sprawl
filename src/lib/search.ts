// Type-ahead search across pipelines, chokepoints, basins, LNG terminals and countries, and US regions,
// states, cities and ZIP codes for "Where is my oil from?". Pure.

import { formationById } from './shale';
import type { Selection } from '../app/urlState';
import { PADDS, SEARCH, STORAGE_NOT_COVERED } from './config';
import { storageByCountry } from './gasStorage';
import type { Datasets } from './data';
import type { Commodity } from '../types';
import { formatCountry } from './format';
import { paddForState, stateForZip } from './oilOrigins';
import { viewEnabled } from './views';

export interface SearchEntry {
  selection: Selection;
  name: string;
  /** Second line in the results: kind and one identifying detail. */
  detail: string;
  /** Normalized name and aliases. */
  terms: string[];
  /** Lower sorts first among equally good matches. */
  priority: number;
  /** For pipelines, so a result can show the right icon. */
  commodity?: Commodity;
}

/** Lowercase, no diacritics, punctuation as spaces: "Urengoy–Pomary" and "urengoy pomary" match. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const COMMODITY_LABELS = { gas: 'Gas', oil: 'Oil', products: 'Products', ngl: 'NGL' } as const;

export function buildSearchIndex(data: Datasets): SearchEntry[] {
  const entry = (selection: Selection, name: string, detail: string, aliases: string[], priority: number): SearchEntry => ({
    selection,
    name,
    detail,
    terms: [...new Set([name, ...aliases].map(normalize).filter(Boolean))],
    priority,
  });
  const storage = viewEnabled('storage') ? storageByCountry(data.series) : new Map();
  const notCovered = new Set(viewEnabled('storage') ? STORAGE_NOT_COVERED.map((c) => c.country) : []);
  const imports = new Set(viewEnabled('origins') ? data.crudeImports.map((r) => r.id) : []);
  const countryDetail = (id: string) =>
    ['Country', storage.has(id) ? 'gas storage' : notCovered.has(id) ? 'storage not covered' : null, imports.has(id) ? 'crude imports' : null]
      .filter(Boolean)
      .join(' · ');
  return [
    ...data.chokepoints.map((c) => entry({ kind: 'chokepoint', id: c.id }, c.name, 'Chokepoint', [], 0)),
    ...data.pipelines.map((p) => {
      const route = [p.fromCountry, ...p.transitCountries, p.toCountry].filter(Boolean).join(' → ');
      const curated = p.sources.includes('curated');
      return {
        ...entry(
          { kind: 'pipeline', id: p.id },
          p.name,
          `${COMMODITY_LABELS[p.commodity]} pipeline${route ? ` · ${route}` : ''}`,
          p.aliases,
          curated ? 1 : 4,
        ),
        commodity: p.commodity,
      };
    }),
    // A country opens its gas storage and crude imports, and a US place its fuel origins: only while those
    // surfaces are on. Countries named as not covered for storage say why.
    ...data.countries
      .filter((c) => storage.has(c.id) || notCovered.has(c.id) || imports.has(c.id))
      .map((c) => entry({ kind: 'country', id: c.id.toLowerCase() }, c.name, countryDetail(c.id), [c.id, formatCountry(c.id)], 2)),
    ...data.oilTerminals.map((t) =>
      entry({ kind: 'terminal', id: t.id }, t.name, `Oil ${t.role} terminal · ${t.country}`, t.aliases, 1),
    ),
    // Empty while the refineries surface is off (assembleDatasets).
    ...data.refineries.map((r) =>
      entry({ kind: 'refinery', id: r.id }, r.name, `Refinery${r.state ? ` · ${r.state}` : ''} · ${r.country}`, [...r.aliases, ...(r.operator ? [r.operator] : [])], 2),
    ),
    ...data.basins.map((b) => entry({ kind: 'basin', id: b.id }, b.name, 'Basin', [], 3)),
    // Empty while FEATURES.shale is off. A play is found by its formation too, and by "fracking", which is
    // what most people call it; plays with an EIA figure first.
    ...data.shalePlays.map((p) =>
      entry({ kind: 'shale', id: p.id }, p.name, `Shale play · ${p.basin} basin`, [...(p.formation ? [formationById(p.formation)!.label] : []), 'shale', 'fracking'], p.formation ? 2 : 3),
    ),
    ...usPlaceEntries(data, entry),
    ...data.lngTerminals.map((t) =>
      entry(
        { kind: 'lng', id: t.id },
        t.name,
        `LNG ${t.facility} terminal${t.country ? ` · ${t.country}` : ''}`,
        t.aliases,
        3,
      ),
    ),
  ];
}

const regionName = (id: string) => PADDS.find((p) => p.id === id)?.name ?? id;
const WHERE = 'where its crude comes from';

/** US regions, states and large cities, each opening its region's "Where is my oil from?" view. */
function usPlaceEntries(
  data: Datasets,
  entry: (selection: Selection, name: string, detail: string, aliases: string[], priority: number) => SearchEntry,
): SearchEntry[] {
  if (!data.oilOrigins.length || !viewEnabled('origins')) return [];
  const regions = PADDS.map((p, i) =>
    entry({ kind: 'region', id: p.id }, `${p.name} fuel region`, `US region · ${WHERE}`, [p.name, `PADD ${i + 1}`, 'where is my oil from'], 2),
  );
  const states = PADDS.flatMap((p) =>
    p.states.map((state) => entry({ kind: 'region', id: p.id }, state, `US state · ${p.name} region, ${WHERE}`, [], 2)),
  );
  const cities = (data.usLookup?.cities ?? []).flatMap((c) => {
    const padd = paddForState(c.state);
    if (!padd) return [];
    // "Nashville-Davidson" and "San Buenaventura (Ventura)" also answer to "Nashville" and "Ventura".
    const aliases = [c.name.split(/[-(]/)[0]!, c.name.match(/\(([^)]+)\)/)?.[1] ?? ''].filter(Boolean);
    return [entry({ kind: 'region', id: padd }, `${c.name}, ${c.state}`, `${regionName(padd)} region, ${WHERE}`, aliases, 3)];
  });
  return [...regions, ...states, ...cities];
}

/**
 * A result for a typed US ZIP code. Built per query and never stored: the ZIP code stays in the
 * search box, and only the region it falls in goes into the URL.
 */
export function zipEntry(data: Datasets, query: string): SearchEntry | null {
  const zip = query.trim();
  if (!/^\d{5}$/.test(zip) || !data.usLookup || !data.oilOrigins.length || !viewEnabled('origins')) return null;
  const state = stateForZip(data.usLookup, zip);
  const padd = state ? paddForState(state) : null;
  if (!state || !padd) return null;
  return {
    selection: { kind: 'region', id: padd },
    name: `ZIP code ${zip}`,
    detail: `${state} · ${regionName(padd)} region, ${WHERE}`,
    terms: [zip],
    priority: 0,
  };
}

/** 0 exact, 1 prefix, 2 word prefix, 3 anywhere; null no match. Every query word must match. */
export function matchScore(terms: string[], query: string): number | null {
  const words = query.split(' ');
  let best: number | null = null;
  for (const term of terms) {
    let score: number;
    if (term === query) score = 0;
    else if (term.startsWith(query)) score = 1;
    else if (words.every((w) => ` ${term}`.includes(` ${w}`))) score = 2;
    else if (words.every((w) => term.includes(w))) score = 3;
    else continue;
    if (best === null || score < best) best = score;
  }
  return best;
}

/** Best matches first: match quality, then kind (chokepoints, corridor pipelines, countries...), then shorter names. */
export function search(index: SearchEntry[], query: string, limit: number = SEARCH.limit): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const score = matchScore(entry.terms, q);
    if (score !== null) hits.push({ entry, score });
  }
  hits.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.priority - b.entry.priority ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.name.localeCompare(b.entry.name),
  );
  return hits.slice(0, limit).map((h) => h.entry);
}

/** What the search can be narrowed to: the rail's surfaces, and basins, which are context only. */
export const SEARCH_SCOPES = ['all', 'chokepoints', 'pipelines', 'terminals', 'refineries', 'countries', 'us-places', 'basins'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/** The scopes the search offers: countries only while gas storage or oil origins is on, US places only with oil origins. */
export const ENABLED_SEARCH_SCOPES: readonly SearchScope[] = SEARCH_SCOPES.filter(
  (s) => (s !== 'refineries' || viewEnabled('refineries')) && (s !== 'countries' || viewEnabled('storage') || viewEnabled('origins')) && (s !== 'us-places' || viewEnabled('origins')),
);

export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  all: 'All',
  chokepoints: 'Chokepoints',
  pipelines: 'Pipelines',
  terminals: 'Terminals',
  refineries: 'Refineries',
  countries: 'Countries',
  'us-places': 'US places',
  basins: 'Basins',
};

const SCOPE_OF: Record<Selection['kind'], Exclude<SearchScope, 'all'>> = {
  chokepoint: 'chokepoints',
  pipeline: 'pipelines',
  terminal: 'terminals',
  lng: 'terminals',
  refinery: 'refineries',
  country: 'countries',
  region: 'us-places',
  basin: 'basins',
  shale: 'basins',
};

/** Result groups: one per kind, finer than the scopes, so oil and LNG terminals head their own lists. */
export const SEARCH_GROUP_LABELS: Record<Selection['kind'], string> = {
  chokepoint: 'Chokepoints',
  pipeline: 'Pipelines',
  terminal: 'Oil terminals',
  lng: 'LNG terminals',
  refinery: 'Refineries',
  country: 'Countries',
  region: 'US places',
  basin: 'Basins',
  shale: 'Shale plays',
};

export interface SearchGroup {
  kind: Selection['kind'];
  label: string;
  entries: SearchEntry[];
}

/**
 * Ranked matches in groups by kind. Groups come in the order of their best match, so the kind you
 * most likely meant leads. Searching everything keeps the first few of each kind; one scope keeps more.
 */
export function groupResults(
  ranked: SearchEntry[],
  scope: SearchScope,
  { perGroup = SEARCH.perGroup, scopedLimit = SEARCH.scopedLimit }: { perGroup?: number; scopedLimit?: number } = {},
): SearchGroup[] {
  const kept = scope === 'all' ? ranked : ranked.filter((e) => SCOPE_OF[e.selection.kind] === scope).slice(0, scopedLimit);
  const groups = new Map<Selection['kind'], SearchEntry[]>();
  for (const entry of kept) groups.set(entry.selection.kind, [...(groups.get(entry.selection.kind) ?? []), entry]);
  return [...groups].map(([kind, entries]) => ({
    kind,
    label: SEARCH_GROUP_LABELS[kind],
    entries: scope === 'all' ? entries.slice(0, perGroup) : entries,
  }));
}
