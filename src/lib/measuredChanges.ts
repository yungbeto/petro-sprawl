// Measured changes for Home (SPEC M8): what the meters and ship counts show moving, against each series'
// own recent weeks. Says what moved and by how much, never why. Pure.

import type { BaselineStat, ObservationSeries } from '../types';
import type { Selection } from '../app/urlState';
import { CHANGES, MEASURED_CHANGES, MEASURED_FLOW } from './config';
import { seriesById, type Datasets } from './data';
import { addDays, windowEndingOn } from './flow';
import { ALSI_URL, ENTSOG_URL } from './evidence';

export const PORTWATCH_URL = 'https://portwatch.imf.org/';

export type MeasuredMetric = 'tanker_transits' | 'gas_flow' | 'lng_sendout';

export interface MeasuredChange {
  selection: Selection;
  name: string;
  metric: MeasuredMetric;
  /** Stopped and resumed cross the idle line; rose and fell are moves past a threshold. */
  direction: 'stopped' | 'resumed' | 'rose' | 'fell';
  recent: BaselineStat;
  prior: BaselineStat;
  /** recent / prior - 1; null when the prior mean is zero. */
  relative: number | null;
  /** (recent - prior) / capacity, 0 to 1; null without a capacity. */
  shareChange: number | null;
  /** The latest data point: the end of the recent window. */
  latestDate: string;
  source: { name: string; url: string };
}

/** The latest `recentDays` of a series and the `priorDays` before them, or null if either is thin or the series is old. */
export function changeWindows(
  series: ObservationSeries | undefined,
  now: Date,
): { recent: BaselineStat; prior: BaselineStat; latestDate: string } | null {
  const latestDate = series?.points.at(-1)?.date;
  if (!series || !latestDate) return null;
  const { recentDays, priorDays, minRecentPoints, minPriorPoints, maxAgeDays } = MEASURED_CHANGES;
  const ageDays = (now.getTime() - Date.parse(`${latestDate}T00:00:00Z`)) / 86_400_000;
  if (ageDays > maxAgeDays) return null;
  const recent = windowEndingOn(series.points, latestDate, recentDays, minRecentPoints);
  const prior = windowEndingOn(series.points, addDays(latestDate, -recentDays), priorDays, minPriorPoints);
  return recent && prior ? { recent, prior, latestDate } : null;
}

const relativeOf = (recent: number, prior: number) => (prior > 0 ? recent / prior - 1 : null);

/** Chokepoint transits: a move of `minRelative` or more, when the prior weeks carried enough ships to measure it. */
export function transitChange(series: ObservationSeries | undefined, now: Date) {
  const w = changeWindows(series, now);
  if (!w) return null;
  const { minRelative, minPriorMean } = MEASURED_CHANGES.transits;
  const relative = relativeOf(w.recent.mean, w.prior.mean);
  if (w.prior.mean < minPriorMean || relative === null || Math.abs(relative) < minRelative) return null;
  return { ...w, direction: relative < 0 ? ('fell' as const) : ('rose' as const), relative, shareChange: null };
}

/**
 * Metered flow: a stop or a restart across the idle line (MEASURED_FLOW.idleShare of capacity, or zero
 * without one), or, when `swings` is on, a move of CHANGES.flowSharePts points of capacity.
 */
export function flowChange(series: ObservationSeries | undefined, now: Date, swings: boolean) {
  const w = changeWindows(series, now);
  if (!w) return null;
  const capacity = series?.capacity ?? null;
  const idle = (mean: number) => (capacity ? mean <= capacity * MEASURED_FLOW.idleShare : mean === 0);
  const relative = relativeOf(w.recent.mean, w.prior.mean);
  const shareChange = capacity ? (w.recent.mean - w.prior.mean) / capacity : null;
  const wasIdle = idle(w.prior.mean);
  const isIdle = idle(w.recent.mean);
  if (!wasIdle && isIdle) return { ...w, direction: 'stopped' as const, relative, shareChange };
  if (wasIdle && !isIdle) return { ...w, direction: 'resumed' as const, relative, shareChange };
  if (swings && shareChange !== null && Math.abs(shareChange) * 100 >= CHANGES.flowSharePts) {
    return { ...w, direction: shareChange < 0 ? ('fell' as const) : ('rose' as const), relative, shareChange };
  }
  return null;
}

/** Every measured change on a mapped asset: stops and restarts first, then the largest relative moves. */
export function measuredChanges(data: Datasets, now: Date): MeasuredChange[] {
  const changes: MeasuredChange[] = [];
  const portwatch = { name: 'IMF PortWatch', url: PORTWATCH_URL };
  for (const c of data.chokepoints) {
    const change = transitChange(seriesById(data, c.transitSeriesId), now);
    if (change) changes.push({ ...change, selection: { kind: 'chokepoint', id: c.id }, name: c.name, metric: 'tanker_transits', source: portwatch });
  }
  // Sections of one system can share a meter; each series is listed once, on the first pipeline that links it.
  const seen = new Set<string>();
  for (const p of data.pipelines) {
    if (!p.flowSeriesId || seen.has(p.flowSeriesId)) continue;
    seen.add(p.flowSeriesId);
    const change = flowChange(seriesById(data, p.flowSeriesId), now, true);
    if (change) changes.push({ ...change, selection: { kind: 'pipeline', id: p.id }, name: p.name, metric: 'gas_flow', source: { name: 'ENTSOG', url: ENTSOG_URL } });
  }
  for (const t of data.lngTerminals) {
    const change = flowChange(seriesById(data, t.sendOutSeriesId), now, false);
    if (change) changes.push({ ...change, selection: { kind: 'lng', id: t.id }, name: t.name, metric: 'lng_sendout', source: { name: 'GIE ALSI', url: ALSI_URL } });
  }
  const crossing = (c: MeasuredChange) => (c.direction === 'stopped' || c.direction === 'resumed' ? 0 : 1);
  const size = (c: MeasuredChange) => Math.abs(c.relative ?? Infinity);
  return changes.sort((a, b) => crossing(a) - crossing(b) || size(b) - size(a) || a.name.localeCompare(b.name));
}

const NOUN: Record<MeasuredMetric, string> = { tanker_transits: 'tanker transits', gas_flow: 'flow', lng_sendout: 'send-out' };

/**
 * What moved, in a line: "tanker transits down 32% on the 4 weeks before", "flow up 18 points of
 * capacity on the 4 weeks before", "no send-out over 7 days", "flow resumed". Dates go beside it.
 */
export function describeChange(c: MeasuredChange): string {
  const noun = NOUN[c.metric];
  const weeks = `on the ${MEASURED_CHANGES.priorDays / 7} weeks before`;
  switch (c.direction) {
    case 'stopped':
      return `no ${noun} over ${MEASURED_CHANGES.recentDays} days`;
    case 'resumed':
      return `${noun} resumed`;
    default: {
      const way = c.direction === 'fell' ? 'down' : 'up';
      if (c.metric === 'gas_flow' && c.shareChange !== null) {
        return `${noun} ${way} ${Math.round(Math.abs(c.shareChange) * 100)} points of capacity ${weeks}`;
      }
      return `${noun} ${way} ${Math.round(Math.abs(c.relative ?? 0) * 100)}% ${weeks}`;
    }
  }
}
