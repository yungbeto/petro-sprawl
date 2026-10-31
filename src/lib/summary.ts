// The summary panel: headline counts for the theater, and what changed since the last visit. Pure.

import type { AssetStatus, Disruption, Pipeline, SourceRef } from '../types';
import type { Selection } from '../app/urlState';
import { AGSI, CHANGES, HOME_HERO, agsiSeriesId, tankerCargoSeriesId } from './config';
import { chokepointFlows, seriesById, type Datasets } from './data';
import { pipelineStatus } from './encoding';
import { isUnverified, latestClaim, pipelineFlow } from './evidence';
import { chokepointFlow, type ChokepointFlow, type FlowBand } from './flow';
import { storageSummary } from './gasStorage';

/** Display order for status counts: what runs, what doesn't, then what isn't built. */
export const STATUS_ORDER: AssetStatus[] = [
  'operating',
  'reduced',
  'idle',
  'offline',
  'under_construction',
  'planned',
  'cancelled',
  'unknown',
];

export function statusCounts(pipelines: Pipeline[]): { status: AssetStatus; count: number }[] {
  return countStatuses(pipelines.map(pipelineStatus));
}

/** How many of each status, in `STATUS_ORDER`, leaving out statuses with none. */
export function countStatuses(statuses: AssetStatus[]): { status: AssetStatus; count: number }[] {
  const counts = new Map<AssetStatus, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return STATUS_ORDER.flatMap((status) => (counts.get(status) ? [{ status, count: counts.get(status)! }] : []));
}

export interface CorridorRow {
  selection: Selection;
  name: string;
  status: AssetStatus;
  /** The status comes from metered flow rather than a claim. */
  measured: boolean;
  /** Date of the claim when it is past the aging threshold and nothing measured backs it. */
  unverifiedSince?: string;
}

/** The hand-researched corridor pipelines, problems first, then by name. */
export function corridorRows(pipelines: Pipeline[], now: Date): CorridorRow[] {
  const rank = (s: AssetStatus) => (s === 'operating' ? 1 : 0);
  return pipelines
    .filter((p) => p.sources.includes('curated'))
    .map((p) => {
      const measured = p.evidence[0]?.sourceType === 'measured';
      const claim = latestClaim(p);
      const row: CorridorRow = {
        selection: { kind: 'pipeline', id: p.id },
        name: p.name,
        status: pipelineStatus(p),
        measured,
      };
      if (!measured && claim && isUnverified(claim, now)) row.unverifiedSince = claim.observedAt;
      return row;
    })
    .sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

export interface ChokepointRow {
  selection: Selection;
  name: string;
  band: FlowBand | null;
  /** The index the band comes from: five-year, or trailing when there is no five-year baseline. */
  index: number | null;
  baseline: 'five-year' | 'trailing';
}

/** Every chokepoint with flow, furthest from baseline first. */
export function chokepointRows(data: Datasets): ChokepointRow[] {
  const flows = chokepointFlows(data);
  const rows: ChokepointRow[] = [];
  for (const c of data.chokepoints) {
    const flow = flows.get(c.id);
    if (!flow) continue;
    const fiveYear = flow.indexFiveYear !== null;
    rows.push({
      selection: { kind: 'chokepoint', id: c.id },
      name: c.name,
      band: flow.band,
      index: fiveYear ? flow.indexFiveYear : flow.indexTrailing,
      baseline: fiveYear ? 'five-year' : 'trailing',
    });
  }
  const distance = (r: ChokepointRow) => (r.index === null ? -1 : Math.abs(Math.log(r.index)));
  return rows.sort((a, b) => distance(b) - distance(a));
}

export interface ChokepointViewRow {
  selection: Selection;
  name: string;
  /** EIA's reference volume, for scale when there is no transit data. */
  eiaReferenceMbd: number;
  transits: ChokepointFlow | null;
  cargo: ChokepointFlow | null;
}

/**
 * Every chokepoint for the chokepoints view: those with transits furthest from baseline first, as on
 * the summary, then those without transit data by name.
 */
export function chokepointViewRows(data: Datasets): ChokepointViewRow[] {
  const order = new Map(chokepointRows(data).map((r, i) => [r.selection.id, i]));
  return data.chokepoints
    .map((c) => ({
      selection: { kind: 'chokepoint' as const, id: c.id },
      name: c.name,
      eiaReferenceMbd: c.eiaReferenceMbd,
      transits: chokepointFlow(seriesById(data, c.transitSeriesId)),
      cargo: chokepointFlow(seriesById(data, tankerCargoSeriesId(c.transitSeriesId.replace(/^portwatch-/, '')))),
    }))
    .sort(
      (a, b) =>
        (order.get(a.selection.id) ?? Infinity) - (order.get(b.selection.id) ?? Infinity) || a.name.localeCompare(b.name),
    );
}

export interface StorageRow {
  selection: Selection;
  country: string;
  fill: number;
  latestDate: string;
  /** Percentage points against the same date last year; null without last year's point. */
  vsLastYear: number | null;
  /** Fill on the same date last year. */
  lastYearFill: number | null;
  /** Percentage points over the last 7 days. */
  change7d: number | null;
}

/** Storage by country, furthest below last year first. Countries without last year's point go last. */
export function storageRows(data: Datasets): StorageRow[] {
  const rows: StorageRow[] = [];
  for (const country of AGSI.countries) {
    const summary = storageSummary(seriesById(data, agsiSeriesId(country)));
    if (!summary) continue;
    rows.push({
      selection: { kind: 'storage', id: country.toLowerCase() },
      country,
      fill: summary.fill,
      latestDate: summary.latestDate,
      vsLastYear: summary.lastYear ? summary.fill - summary.lastYear.fill : null,
      lastYearFill: summary.lastYear?.fill ?? null,
      change7d: summary.change7d,
    });
  }
  return rows.sort((a, b) => (a.vsLastYear ?? Infinity) - (b.vsLastYear ?? Infinity));
}

// What changed since last visit

/** What a visit saw, kept in localStorage so the next visit can compare. Keyed by selection id. */
export interface Snapshot {
  savedAt: string;
  pipelines: Record<string, AssetStatus>;
  /** Measured flow as share of capacity, 0 to 1. */
  flowShares: Record<string, number>;
  chokepoints: Record<string, FlowBand | null>;
  storage: Record<string, number>;
  disruptions: string[];
}

export function takeSnapshot(data: Datasets, now: Date): Snapshot {
  const pipelines: Snapshot['pipelines'] = {};
  const flowShares: Snapshot['flowShares'] = {};
  for (const p of data.pipelines) {
    pipelines[p.id] = pipelineStatus(p);
    const share = pipelineFlow(seriesById(data, p.flowSeriesId))?.share;
    if (share != null) flowShares[p.id] = share;
  }
  const chokepoints: Snapshot['chokepoints'] = {};
  for (const row of chokepointRows(data)) chokepoints[row.selection.id] = row.band;
  const storage: Snapshot['storage'] = {};
  for (const row of storageRows(data)) storage[row.selection.id] = row.fill;
  return {
    savedAt: now.toISOString(),
    pipelines,
    flowShares,
    chokepoints,
    storage,
    disruptions: data.disruptions.map((d) => d.id),
  };
}

export type Change =
  | { kind: 'status'; selection: Selection; name: string; from: AssetStatus; to: AssetStatus }
  | { kind: 'flow-share'; selection: Selection; name: string; from: number; to: number }
  | { kind: 'band'; selection: Selection; name: string; from: FlowBand | null; to: FlowBand | null }
  | { kind: 'storage'; selection: Selection; name: string; from: number; to: number }
  | { kind: 'disruption'; selection: Selection; name: string; startedAt: string; summary: string };

/** Values present in both snapshots, so a dataset that failed to load never reads as a change. */
function shared<T>(before: Record<string, T>, after: Record<string, T>): [string, T, T][] {
  return Object.keys(after).flatMap((id) => (id in before ? [[id, before[id]!, after[id]!] as [string, T, T]] : []));
}

/**
 * Changes between the last visit and now, in a fixed order: new disruptions, status changes,
 * chokepoint band changes, flow swings, storage moves. `names` maps "kind/id" to a display name.
 */
export function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
  data: Datasets,
  names: (selection: Selection) => string,
): Change[] {
  const changes: Change[] = [];
  const seen = new Set(before.disruptions);
  // An empty list last time means the file didn't load, not that every disruption is new.
  if (before.disruptions.length) {
    for (const d of data.disruptions) {
      if (seen.has(d.id) || !after.disruptions.includes(d.id)) continue;
      const selection: Selection = { kind: d.assetKind, id: d.assetId };
      changes.push({ kind: 'disruption', selection, name: names(selection), startedAt: d.startedAt, summary: d.summary });
    }
  }
  for (const [id, from, to] of shared(before.pipelines, after.pipelines)) {
    if (from === to) continue;
    const selection: Selection = { kind: 'pipeline', id };
    changes.push({ kind: 'status', selection, name: names(selection), from, to });
  }
  for (const [id, from, to] of shared(before.chokepoints, after.chokepoints)) {
    if (from === to) continue;
    const selection: Selection = { kind: 'chokepoint', id };
    changes.push({ kind: 'band', selection, name: names(selection), from, to });
  }
  for (const [id, from, to] of shared(before.flowShares, after.flowShares)) {
    if (Math.abs(to - from) * 100 < CHANGES.flowSharePts) continue;
    const selection: Selection = { kind: 'pipeline', id };
    changes.push({ kind: 'flow-share', selection, name: names(selection), from, to });
  }
  for (const [id, from, to] of shared(before.storage, after.storage)) {
    if (Math.abs(to - from) < CHANGES.storageMovePts) continue;
    const selection: Selection = { kind: 'storage', id };
    changes.push({ kind: 'storage', selection, name: names(selection), from, to });
  }
  return changes;
}

/** Stored between visits: the snapshot this visit compares against, and this visit's own. */
export interface VisitRecord {
  previous: Snapshot | null;
  current: Snapshot;
}

/**
 * Decides what this load compares against and what to store. A load within sameVisitMinutes of the
 * last one continues that visit and keeps its baseline; otherwise the last load becomes the baseline.
 */
export function nextVisit(stored: VisitRecord | null, snapshot: Snapshot): { compareTo: Snapshot | null; record: VisitRecord } {
  if (!stored) return { compareTo: null, record: { previous: null, current: snapshot } };
  const gapMinutes = (Date.parse(snapshot.savedAt) - Date.parse(stored.current.savedAt)) / 60_000;
  const previous = gapMinutes < CHANGES.sameVisitMinutes ? stored.previous : stored.current;
  return { compareTo: previous, record: { previous, current: snapshot } };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isSnapshot(v: unknown): v is Snapshot {
  return (
    isRecord(v) &&
    typeof v.savedAt === 'string' &&
    !Number.isNaN(Date.parse(v.savedAt)) &&
    ['pipelines', 'flowShares', 'chokepoints', 'storage'].every((k) => isRecord(v[k])) &&
    Array.isArray(v.disruptions)
  );
}

/** Reads a stored visit record, or null if it is missing or not in the shape this version writes. */
export function parseVisitRecord(raw: string | null): VisitRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isSnapshot(value.current)) return null;
    return { previous: isSnapshot(value.previous) ? value.previous : null, current: value.current };
  } catch {
    return null;
  }
}

/** Middle value, or the mean of the middle two; null for none. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Pipeline statuses folded into the four groups the dashboard bar shows, in display order. */
export const STATUS_GROUPS = [
  { id: 'running', label: 'Operating or reduced', statuses: ['operating', 'reduced'] },
  { id: 'stopped', label: 'Offline or idle', statuses: ['offline', 'idle'] },
  { id: 'unbuilt', label: 'Not built', statuses: ['under_construction', 'planned', 'cancelled'] },
  { id: 'unknown', label: 'Unknown', statuses: ['unknown'] },
] as const satisfies readonly { id: string; label: string; statuses: readonly AssetStatus[] }[];

export type StatusGroupId = (typeof STATUS_GROUPS)[number]['id'];

export function statusGroups(counts: { status: AssetStatus; count: number }[]): { id: StatusGroupId; label: string; count: number }[] {
  return STATUS_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    count: counts.filter((c) => (g.statuses as readonly AssetStatus[]).includes(c.status)).reduce((n, c) => n + c.count, 0),
  }));
}

export interface OngoingDisruption {
  disruption: Disruption;
  selection: Selection;
  name: string;
}

export interface Situation {
  /** The disruption in effect with the newest report: the hero's headline. */
  latest: OngoingDisruption | null;
  /** Disruptions with no end date, newest report first, then most recent start. */
  ongoing: OngoingDisruption[];
  /** How many assets of each kind have one in effect; LNG and oil terminals count together. */
  assets: { chokepoints: number; pipelines: number; terminals: number };
}

const SELECTION_OF: Record<Disruption['assetKind'], Selection['kind']> = {
  chokepoint: 'chokepoint',
  pipeline: 'pipeline',
  lng: 'lng',
  terminal: 'terminal',
};

/** A disruption's newest source, the one its card leads with; the first listed wins a tie. */
export function newestSource(d: Disruption): SourceRef | null {
  return d.sources.reduce<SourceRef | null>((newest, s) => (!newest || s.publishedAt > newest.publishedAt ? s : newest), null);
}

/** When a disruption was last reported: the newest of its sources, or its start when none is dated later. */
export function lastReported(d: Disruption): string {
  const newest = newestSource(d)?.publishedAt;
  return newest && newest > d.startedAt ? newest : d.startedAt;
}

/**
 * A disruption in effect whose newest report is older than STALE_AFTER_DAYS ages as a claim does: the
 * date of that report, so the hero can say "no report since". Null while it is recent.
 */
export function quietSince(d: Disruption, now: Date): string | null {
  const reported = lastReported(d);
  return isUnverified({ observedAt: reported }, now) ? reported : null;
}

/**
 * The home hero: the disruption in effect with the newest report, then every disruption in effect and
 * what they touch. Ordered by report, not start, so news on a months-old disruption brings it back up.
 */
export function situation(data: Datasets): Situation {
  const names = new Map<string, string>([
    ...data.chokepoints.map((c) => [`chokepoint/${c.id}`, c.name] as const),
    ...data.pipelines.map((p) => [`pipeline/${p.id}`, p.name] as const),
    ...data.lngTerminals.map((t) => [`lng/${t.id}`, t.name] as const),
    ...data.oilTerminals.map((t) => [`terminal/${t.id}`, t.name] as const),
  ]);
  const ongoing = data.disruptions
    .filter((d) => !d.endedAt)
    .sort(
      (a, b) =>
        lastReported(b).localeCompare(lastReported(a)) || b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id),
    )
    .flatMap((d) => {
      const name = names.get(`${d.assetKind}/${d.assetId}`);
      return name ? [{ disruption: d, selection: { kind: SELECTION_OF[d.assetKind], id: d.assetId }, name }] : [];
    });
  const distinct = (kinds: Disruption['assetKind'][]) =>
    new Set(ongoing.filter((o) => kinds.includes(o.disruption.assetKind)).map((o) => o.disruption.assetId)).size;
  return {
    latest: ongoing[0] ?? null,
    ongoing,
    assets: { chokepoints: distinct(['chokepoint']), pipelines: distinct(['pipeline']), terminals: distinct(['lng', 'terminal']) },
  };
}

/** A summary's first sentence, for a headline's lede. A full stop only ends one before a capital. */
export function firstSentence(text: string): string {
  return text.split(/(?<=\.)\s+(?=[A-Z])/)[0] ?? text;
}

/**
 * A report or start date as news reads it: "today", "yesterday", "3 days ago", then the date once
 * it's older than HOME_HERO.recentDays. A month-only date (no day given) stays the month. Counted in
 * the reader's calendar days, as the date above it is.
 */
export function dateAgo(date: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days <= HOME_HERO.recentDays ? `${days} days ago` : date;
}
