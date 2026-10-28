// Status evidence: measured flow as evidence, and symmetric aging of the current claim.

import type { Evidence, ObservationSeries, Pipeline } from '../types';
import { FLOW_WINDOWS, MEASURED_FLOW, STALE_AFTER_DAYS } from './config';
import { addDays, windowEndingOn } from './flow';
import { formatEnergyPerDay, formatIndexShare } from './format';

export const ENTSOG_URL = 'https://transparency.entsog.eu/';

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
export function measuredEvidence(series: ObservationSeries | undefined): Evidence | null {
  const flow = pipelineFlow(series);
  if (!flow || flow.recentMean === null) return null;
  const idle = flow.share !== null ? flow.share <= MEASURED_FLOW.idleShare : flow.recentMean === 0;
  const share = flow.share !== null ? `, ${formatIndexShare(flow.share)} of firm technical capacity` : '';
  const where = flow.label ? ` at ${flow.label}` : '';
  return {
    status: idle ? 'idle' : 'operating',
    sourceType: 'measured',
    statement: `${MEASURED_FLOW.windowDays}-day mean ${formatEnergyPerDay(flow.recentMean)}${share}${where} (ENTSOG)`,
    url: ENTSOG_URL,
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

/** The most recent claim that isn't measured flow: what a source said, shown beside the meter. */
export function latestClaim(pipeline: Pipeline): Evidence | undefined {
  return pipeline.evidence.find((e) => e.sourceType !== 'measured');
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
export function isUnverified(evidence: Evidence | undefined, now: Date, staleDays = STALE_AFTER_DAYS): boolean {
  if (!evidence) return false;
  return now.getTime() - observedEnd(evidence.observedAt) > staleDays * 86_400_000;
}
