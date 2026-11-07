// Status evidence: measured flow as evidence, and symmetric aging of the current claim.

import type { Evidence, LngTerminal, ObservationSeries, Pipeline } from '../types';
import { FLOW_WINDOWS, MEASURED_FLOW, STALE_AFTER_DAYS } from './config';
import { addDays, windowEndingOn } from './flow';
import { formatEnergyPerDay, formatIndexShare } from './format';

export const ENTSOG_URL = 'https://transparency.entsog.eu/';
export const ALSI_URL = 'https://alsi.gie.eu/';

/** Who measured a series, and what its capacity figure is, for the measured claim's wording. */
export interface MeterSource {
  name: string;
  url: string;
  capacity: string;
  /** Name the metering point: an ENTSOG point is somewhere along the line; an ALSI series is the terminal itself. */
  namePoint: boolean;
}

export const ENTSOG_METER: MeterSource = { name: 'ENTSOG', url: ENTSOG_URL, capacity: 'firm technical capacity', namePoint: true };
export const ALSI_METER: MeterSource = { name: 'GIE ALSI', url: ALSI_URL, capacity: 'declared send-out capacity', namePoint: false };

export interface PipelineFlow {
  latestDate: string;
  /** Mean of the last MEASURED_FLOW.windowDays days. */
  recentMean: number | null;
  /** Technical capacity in the series unit, when ENTSOG gives one. */
  capacity: number | null;
  /** recentMean as a share of capacity, 0 to 1 (can exceed 1). */
  share: number | null;
  sparkline: ObservationSeries['points'];
  label?: string;
}

export function pipelineFlow(series: ObservationSeries | undefined): PipelineFlow | null {
  const latestDate = series?.points.at(-1)?.date;
  if (!series || !latestDate) return null;
  const recent = windowEndingOn(series.points, latestDate, MEASURED_FLOW.windowDays, FLOW_WINDOWS.minRecentPoints);
  const capacity = series.capacity ?? null;
  const recentMean = recent?.mean ?? null;
  const from = addDays(latestDate, -(FLOW_WINDOWS.sparklineDays - 1));
  return {
    latestDate,
    recentMean,
    capacity,
    share: recentMean !== null && capacity ? recentMean / capacity : null,
    sparkline: series.points.filter((p) => p.date >= from),
    ...(series.label ? { label: series.label } : {}),
  };
}

/**
 * Evidence derived from measured flow (SPEC 6, "measured beats claimed"). No flow over the
 * window is idle: the meter says gas isn't moving, not why. Anything else is operating.
 */
export function measuredEvidence(series: ObservationSeries | undefined, meter: MeterSource = ENTSOG_METER): Evidence | null {
  const flow = pipelineFlow(series);
  if (!flow || flow.recentMean === null) return null;
  const idle = flow.share !== null ? flow.share <= MEASURED_FLOW.idleShare : flow.recentMean === 0;
  const share = flow.share !== null ? `, ${formatIndexShare(flow.share)} of ${meter.capacity}` : '';
  const where = meter.namePoint && flow.label ? ` at ${flow.label}` : '';
  return {
    status: idle ? 'idle' : 'operating',
    sourceType: 'measured',
    statement: `${MEASURED_FLOW.windowDays}-day mean ${formatEnergyPerDay(flow.recentMean)}${share}${where} (${meter.name})`,
    url: meter.url,
    observedAt: flow.latestDate,
    recordedAt: flow.latestDate,
  };
}

/** Pipelines with measured evidence put first, for those linked to a flow series. */
export function withMeasuredEvidence(pipelines: Pipeline[], series: ObservationSeries[]): Pipeline[] {
  const byId = new Map(series.map((s) => [s.id, s]));
  return pipelines.map((p) => {
    const measured = p.flowSeriesId ? measuredEvidence(byId.get(p.flowSeriesId)) : null;
    return measured ? { ...p, evidence: [measured, ...p.evidence] } : p;
  });
}

/** LNG terminals with measured send-out put first, for those linked to an ALSI series. */
export function withMeasuredLngEvidence(terminals: LngTerminal[], series: ObservationSeries[]): LngTerminal[] {
  const byId = new Map(series.map((s) => [s.id, s]));
  return terminals.map((t) => {
    const measured = t.sendOutSeriesId ? measuredEvidence(byId.get(t.sendOutSeriesId), ALSI_METER) : null;
    return measured ? { ...t, evidence: [measured, ...t.evidence] } : t;
  });
}

/** The most recent claim that isn't measured: what a source said, shown beside the meter. */
export function latestClaim(asset: { evidence: Evidence[] }): Evidence | undefined {
  return asset.evidence.find((e) => e.sourceType !== 'measured');
}

/** A month-only date ("2026-01") counts from the end of that month, so it never ages early. */
function observedEnd(observedAt: string): number {
  if (observedAt.length === 7) {
    const [y, m] = observedAt.split('-').map(Number);
    return Date.UTC(y!, m!, 1) - 1;
  }
  return Date.parse(`${observedAt}T23:59:59Z`);
}

/**
 * Symmetric aging (SPEC 6): a claim older than staleDays is unverified, whatever its status.
 * The status itself never changes.
 */
export function isUnverified(evidence: Pick<Evidence, 'observedAt'> | undefined, now: Date, staleDays = STALE_AFTER_DAYS): boolean {
  if (!evidence) return false;
  return now.getTime() - observedEnd(evidence.observedAt) > staleDays * 86_400_000;
}

/** A report's own words, who it credits and the site it links to, for showing it as an item of its own. */
export interface ReportParts {
  text: string;
  /** Whoever the statement credits in its closing parentheses ("Bloomberg, via Energy Connects"). */
  publisher?: string;
  /** The linked site, without "www." */
  host?: string;
}

/**
 * What an asset's status rests on, from its current evidence: a meter, a dated report, or only a dataset's
 * listing (GEM's tracker status, EIA's 1 January split), which says how an asset is recorded, not that a
 * source has seen it in that state. `none` when there is no evidence at all. Pure.
 */
export type StatusBasis = 'measured' | 'reported' | 'listed' | 'none';

export function statusBasis(current: Pick<Evidence, 'sourceType'> | undefined): StatusBasis {
  if (!current) return 'none';
  if (current.sourceType === 'measured') return 'measured';
  return current.sourceType === 'dataset' ? 'listed' : 'reported';
}

/** Claims from people and publications, as opposed to datasets and meters. */
export function isReport(evidence: Evidence): boolean {
  return evidence.sourceType !== 'dataset' && evidence.sourceType !== 'measured';
}

/**
 * Splits a curated statement's closing credit from its text: "… far below pre-war levels (Bloomberg,
 * via Energy Connects)." gives the text without it and the publisher. Statements without one keep their
 * text whole. Pure.
 */
export function reportParts(evidence: Evidence): ReportParts {
  const statement = (evidence.statement ?? '').trim();
  const match = /^(.*\S)\s*\(([^()]+)\)\.?$/s.exec(statement);
  const text = match ? `${match[1]!.replace(/[.;,]$/, '')}.` : statement;
  let host: string | undefined;
  try {
    if (evidence.url) host = new URL(evidence.url).hostname.replace(/^www\./, '');
  } catch {
    host = undefined;
  }
  return { text, ...(match ? { publisher: match[2]!.trim() } : {}), ...(host ? { host } : {}) };
}
