// The summary panel: headline counts for the theater, and what changed since the last visit. Pure.

import type { AssetStatus, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import { AGSI, CHANGES, agsiSeriesId } from './config';
import { chokepointFlows, seriesById, type Datasets } from './data';
import { pipelineStatus } from './encoding';
import { isUnverified, latestClaim, pipelineFlow } from './evidence';
import type { FlowBand } from './flow';
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
  const counts = new Map<AssetStatus, number>();
  for (const p of pipelines) counts.set(pipelineStatus(p), (counts.get(pipelineStatus(p)) ?? 0) + 1);
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

export interface StorageRow {
  selection: Selection;
  country: string;
  fill: number;
  latestDate: string;
  /** Percentage points against the same date last year; null without last year's point. */
  vsLastYear: number | null;
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
