import type { Evidence, PageRef, Pipeline, PipelineHistory, SourceRef } from '../../src/types';
import { DEDUP } from '../../src/lib/config';

/** A hand-researched corridor pipeline (data/curated/pipelines-evidence.json). */
export interface CuratedPipeline {
  id: string;
  name: string;
  aliases: string[];
  /** The system this record is one section of; otherwise the GEM rows' system when they all share one. */
  system?: string;
  commodity: Pipeline['commodity'];
  fromCountry: string;
  toCountry: string;
  transitCountries: string[];
  /** GEM rows that make up this pipeline, checked by hand. */
  gem: string[];
  /** Also merge GEM rows that match by name and countries. Off for systems whose segments share a name. */
  autoMatch?: boolean;
  /** GEM rows never to merge, even if they match. */
  exclude?: string[];
  capacity?: NonNullable<Pipeline['capacity']> & { source: SourceRef | PageRef };
  /** Cited shareholders. They replace GEM's owners and its parent chain, which may not match them. */
  owners?: { list: NonNullable<Pipeline['owners']>; source: PageRef };
  evidence: Evidence[];
}

export interface MergeEntry {
  gemId: string;
  gemName: string;
  reason: 'listed' | 'name and countries';
  score?: number;
}

export interface DedupReport {
  merged: { curatedId: string; rows: MergeEntry[] }[];
  /** Listed GEM ids that don't exist in the GEM file. */
  missing: { curatedId: string; gemId: string }[];
  /** GEM rows two curated records both claim; the first record keeps them. */
  conflicts: { gemId: string; keptBy: string; alsoClaimedBy: string }[];
  /** Name matches left out because a country is off the curated route. For review. */
  nearMisses: { curatedId: string; gemId: string; gemName: string; score: number }[];
}

const NOISE = new Set(['gas', 'oil', 'ngl', 'crude', 'pipeline', 'pipelines', 'system', 'the']);

/** The project name before GEM's " · segment" suffix, as comparable tokens. */
export function nameTokens(name: string): string[] {
  const base = name.split(' · ')[0] ?? name;
  return base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !NOISE.has(t));
}

/**
 * Dice similarity of name tokens, 0 to 1. Numbers must agree exactly, so "Nord Stream"
 * and "Nord Stream 2" never match however close the words are.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const numbers = (t: string[]) => t.filter((x) => /^\d+$/.test(x)).sort().join(' ');
  if (!ta.length || !tb.length || numbers(ta) !== numbers(tb)) return 0;
  const setB = new Set(tb);
  const shared = new Set(ta.filter((t) => setB.has(t))).size;
  return (2 * shared) / (new Set(ta).size + setB.size);
}

const routeCountries = (p: { fromCountry: string; toCountry: string; transitCountries: string[] }) =>
  [p.fromCountry, ...p.transitCountries, p.toCountry].filter(Boolean);

/** Best similarity between a GEM row and the curated name or any alias. */
function bestScore(curated: CuratedPipeline, gem: Pipeline): number {
  return Math.max(...[curated.name, ...curated.aliases].map((n) => nameSimilarity(n, gem.name)));
}

/** GEM rows that belong to a curated pipeline: listed ones, plus name and country matches. */
export function matchGemRows(
  curated: CuratedPipeline,
  gem: Pipeline[],
): { matches: MergeEntry[]; nearMisses: DedupReport['nearMisses'] } {
  const matches: MergeEntry[] = [];
  const nearMisses: DedupReport['nearMisses'] = [];
  const excluded = new Set(curated.exclude ?? []);
  const route = new Set(routeCountries(curated));
  for (const row of gem) {
    if (excluded.has(row.id)) continue;
    if (curated.gem.includes(row.id)) {
      matches.push({ gemId: row.id, gemName: row.name, reason: 'listed' });
      continue;
    }
    if (curated.autoMatch === false || row.commodity !== curated.commodity) continue;
    const score = bestScore(curated, row);
    if (score < DEDUP.minNameSimilarity) continue;
    const rounded = Math.round(score * 100) / 100;
    if (routeCountries(row).every((c) => route.has(c))) {
      matches.push({ gemId: row.id, gemName: row.name, reason: 'name and countries', score: rounded });
    } else {
      nearMisses.push({ curatedId: curated.id, gemId: row.id, gemName: row.name, score: rounded });
    }
  }
  return { matches, nearMisses };
}

/**
 * Cited claims rank above dataset claims, newest first within each. A dataset's date is when
 * the dataset last touched the row, not when anyone observed the pipeline, so a newer GEM row
 * must not displace a dated, sourced claim. Measured flow is put first later, in the app.
 */
/** Cited claims before dataset claims, then newest first (SPEC 6). */
export const byRankThenObservedDesc = (a: Evidence, b: Evidence) =>
  Number(a.sourceType === 'dataset') - Number(b.sourceType === 'dataset') || b.observedAt.localeCompare(a.observedAt);

/**
 * The history of a system from its GEM rows: every year a section opened, the earliest proposal
 * and construction start, and a stop year only once every section has stopped.
 */
export function mergeHistory(rows: Pipeline[]): PipelineHistory | undefined {
  const histories = rows.flatMap((r) => r.history ?? []);
  if (!histories.length) return undefined;
  const earliest = (years: (number | undefined)[]) => {
    const known = years.filter((y): y is number => y !== undefined);
    return known.length ? Math.min(...known) : undefined;
  };
  const proposalYear = earliest(histories.map((h) => h.proposalYear));
  const constructionYear = earliest(histories.map((h) => h.constructionYear));
  const stops = rows.map((r) => r.history?.stopYear);
  const stopYear = stops.every((y) => y !== undefined) ? Math.max(...(stops as number[])) : undefined;
  return {
    startYears: [...new Set(histories.flatMap((h) => h.startYears))].sort((a, b) => a - b),
    expected: histories.every((h) => h.expected),
    ...(proposalYear !== undefined ? { proposalYear } : {}),
    ...(constructionYear !== undefined ? { constructionYear } : {}),
    ...(stopYear !== undefined ? { stopYear } : {}),
  };
}

/** One curated pipeline built from its GEM rows. Curated fields win; GEM fills the rest. */
export function mergeCurated(curated: CuratedPipeline, rows: Pipeline[]): Pipeline {
  // Largest row first, so operator and owners come from the main line rather than a spur.
  const sorted = [...rows].sort((a, b) => (b.capacity?.value ?? 0) - (a.capacity?.value ?? 0));
  const main = sorted[0];
  const lines = rows.flatMap((r) =>
    r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates,
  );
  const seen = new Set<string>();
  const evidence = [...curated.evidence, ...rows.flatMap((r) => r.evidence)]
    .filter((e) => {
      // Parallel strings often carry the same dataset claim; keep it once.
      const key = [e.status, e.sourceType, e.statement, e.url, e.observedAt].join('|');
      return !seen.has(key) && seen.add(key);
    })
    .sort(byRankThenObservedDesc);
  const aliases = [...new Set([...curated.aliases, ...rows.map((r) => r.name)])].filter((a) => a !== curated.name);
  const pipeline: Pipeline = {
    id: curated.id,
    name: curated.name,
    aliases,
    commodity: curated.commodity,
    fromCountry: curated.fromCountry,
    toCountry: curated.toCountry,
    transitCountries: curated.transitCountries,
    geometry: { type: 'MultiLineString', coordinates: lines },
    geometryApprox: rows.length > 0 && rows.every((r) => r.geometryApprox),
    evidence,
    sources: ['curated', ...new Set(rows.flatMap((r) => r.sources))],
  };
  if (main?.operator) pipeline.operator = main.operator;
  const systems = new Set(rows.map((r) => r.system));
  const system = curated.system ?? (systems.size === 1 ? [...systems][0] : undefined);
  if (system) pipeline.system = system;
  if (curated.owners) {
    pipeline.owners = curated.owners.list;
    pipeline.ownersSource = curated.owners.source;
  } else {
    if (main?.owners) pipeline.owners = main.owners;
    if (main?.parents) pipeline.parents = main.parents;
  }
  const history = mergeHistory(rows);
  if (history) pipeline.history = history;
  // Length, diameter and end points describe one line; summed over parallel strings or spurs they'd mislead.
  if (rows.length === 1 && main) {
    if (main.lengthKm) pipeline.lengthKm = main.lengthKm;
    if (main.diameter) pipeline.diameter = main.diameter;
    if (main.endpoints) pipeline.endpoints = main.endpoints;
  }
  if (curated.capacity) {
    const { source, ...capacity } = curated.capacity;
    pipeline.capacity = capacity;
    pipeline.capacitySource = source;
  } else if (main?.capacity) {
    // Segments in series share one capacity; parallel strings would add up, which needs a cited figure.
    pipeline.capacity = main.capacity;
  }
  return pipeline;
}

/**
 * Replaces GEM rows with the curated pipelines they belong to. Curated records without any
 * GEM row are dropped (no geometry to draw) and reported as missing.
 */
export function mergePipelines(
  curated: CuratedPipeline[],
  gem: Pipeline[],
  flowLinks: Map<string, string> = new Map(),
): { pipelines: Pipeline[]; report: DedupReport } {
  const report: DedupReport = { merged: [], missing: [], conflicts: [], nearMisses: [] };
  const gemIds = new Set(gem.map((p) => p.id));
  const claimedBy = new Map<string, string>();
  const built: Pipeline[] = [];

  for (const record of curated) {
    for (const id of record.gem) if (!gemIds.has(id)) report.missing.push({ curatedId: record.id, gemId: id });
    const { matches, nearMisses } = matchGemRows(record, gem);
    report.nearMisses.push(...nearMisses);
    const kept = matches.filter((m) => {
      const owner = claimedBy.get(m.gemId);
      if (owner) report.conflicts.push({ gemId: m.gemId, keptBy: owner, alsoClaimedBy: record.id });
      return !owner;
    });
    for (const m of kept) claimedBy.set(m.gemId, record.id);
    if (!kept.length) continue;
    report.merged.push({ curatedId: record.id, rows: kept });
    const rows = gem.filter((p) => kept.some((m) => m.gemId === p.id));
    built.push(mergeCurated(record, rows));
  }

  const pipelines = [...built, ...gem.filter((p) => !claimedBy.has(p.id))].map((p) => {
    const flowSeriesId = flowLinks.get(p.id);
    return flowSeriesId ? { ...p, flowSeriesId } : p;
  });
  pipelines.sort((a, b) => a.name.localeCompare(b.name));
  return { pipelines, report };
}
