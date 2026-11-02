// Chokepoint flow index: recent average against a baseline average. Pure; used by jobs and app.

import type { BaselineStat, ObservationSeries } from '../types';
import { FLOW_INDEX_BANDS, FLOW_WINDOWS } from './config';

type Point = ObservationSeries['points'][number];

export type FlowBand = 'below' | 'near' | 'above';

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Mean of points with from <= date <= to. Null when fewer than minCount points fall inside. */
export function windowMean(points: Point[], from: string, to: string, minCount: number): BaselineStat | null {
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (p.date >= from && p.date <= to) {
      sum += p.value;
      count++;
    }
  }
  return count >= minCount && count > 0 ? { mean: sum / count, from, to, count } : null;
}

/** Window of `days` days ending on `end`, inclusive. */
export function windowEndingOn(points: Point[], end: string, days: number, minCount: number): BaselineStat | null {
  return windowMean(points, addDays(end, -(days - 1)), end, minCount);
}

/**
 * The five years before the trailing year, measured back from `latest`.
 * The job calls this on full history; the result is stored on the series.
 */
export function fiveYearBaseline(points: Point[], latest: string): BaselineStat | null {
  const { trailingDays, fiveYearDays, minFiveYearPoints } = FLOW_WINDOWS;
  const to = addDays(latest, -trailingDays);
  return windowEndingOn(points, to, fiveYearDays, minFiveYearPoints);
}

/** Ratio of recent to baseline. Null if either is missing or the baseline is zero. */
export function flowIndex(recent: number | null | undefined, baseline: number | null | undefined): number | null {
  if (recent == null || baseline == null || baseline <= 0) return null;
  return recent / baseline;
}

export function flowBand(index: number | null): FlowBand | null {
  if (index === null) return null;
  if (index < FLOW_INDEX_BANDS.below) return 'below';
  if (index > FLOW_INDEX_BANDS.above) return 'above';
  return 'near';
}

export interface ChokepointFlow {
  latestDate: string;
  recent: BaselineStat | null;
  trailing: BaselineStat | null;
  fiveYear: BaselineStat | null;
  indexTrailing: number | null;
  indexFiveYear: number | null;
  /** Band used for the map: the five-year index, falling back to the trailing one. */
  band: FlowBand | null;
  sparkline: Point[];
  /** The same days as the sparkline, each the mean of the `recentDays` ending on it: the line the index reads. */
  trend: Point[];
}

/**
 * For each point on or after `from`, the mean of the points in the `days` ending on its date (fewer
 * where the series has gaps). Points must be in date order.
 */
export function trailingMeans(points: Point[], days: number, from: string): Point[] {
  const out: Point[] = [];
  let start = 0;
  let sum = 0;
  for (let end = 0; end < points.length; end++) {
    const point = points[end]!;
    sum += point.value;
    const windowFrom = addDays(point.date, -(days - 1));
    while (points[start]!.date < windowFrom) sum -= points[start++]!.value;
    if (point.date >= from) out.push({ ...point, value: sum / (end - start + 1) });
  }
  return out;
}

/** Everything the map and panel show for one chokepoint. Windows end on the latest data point, not today. */
export function chokepointFlow(series: ObservationSeries | undefined): ChokepointFlow | null {
  const latestDate = series?.points.at(-1)?.date;
  if (!series || !latestDate) return null;
  const { recentDays, minRecentPoints, trailingDays, minTrailingPoints, sparklineDays } = FLOW_WINDOWS;
  const recent = windowEndingOn(series.points, latestDate, recentDays, minRecentPoints);
  const trailing = windowEndingOn(series.points, latestDate, trailingDays, minTrailingPoints);
  const fiveYear = series.fiveYear ?? null;
  const indexTrailing = flowIndex(recent?.mean, trailing?.mean);
  const indexFiveYear = flowIndex(recent?.mean, fiveYear?.mean);
  const sparkFrom = addDays(latestDate, -(sparklineDays - 1));
  return {
    latestDate,
    recent,
    trailing,
    fiveYear,
    indexTrailing,
    indexFiveYear,
    band: flowBand(indexFiveYear ?? indexTrailing),
    sparkline: series.points.filter((p) => p.date >= sparkFrom),
    trend: trailingMeans(series.points, recentDays, sparkFrom),
  };
}
