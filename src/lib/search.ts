// Type-ahead search across pipelines, chokepoints, basins and countries. Pure.

import type { Selection } from '../app/urlState';
import { SEARCH, agsiSeriesId } from './config';
import type { Datasets } from './data';
import type { Commodity } from '../types';
import { formatCountry } from './format';

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
  const storageIds = new Set(data.series.filter((s) => s.metric === 'storage_fill_pct').map((s) => s.id));
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
    ...data.countries.map((c) =>
      entry(
        { kind: 'storage', id: c.id.toLowerCase() },
        c.name,
        storageIds.has(agsiSeriesId(c.id)) ? 'Country · gas storage' : 'Country',
        [c.id, formatCountry(c.id)],
        2,
      ),
    ),
    ...data.basins.map((b) => entry({ kind: 'basin', id: b.id }, b.name, 'Basin', [], 3)),
  ];
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
