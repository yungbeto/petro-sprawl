// EU gas storage by country: latest fill, recent change, and the same date last year.

import type { ObservationSeries } from '../types';
import { agsiSeriesId } from './config';
import { addDays } from './flow';

export interface StorageSummary {
  latestDate: string;
  /** Percent of working gas volume. */
  fill: number;
  /** Percentage points over the last 7 days; null without a point a week back. */
  change7d: number | null;
  /** Fill on the same calendar date a year earlier, or the nearest day within 3 days. */
  lastYear: { date: string; fill: number } | null;
  /** The last year of points, for the chart. */
  year: ObservationSeries['points'];
}

/** The point on `date`, or the closest one within `toleranceDays`. */
function pointNear(points: ObservationSeries['points'], date: string, toleranceDays: number) {
  for (let d = 0; d <= toleranceDays; d++) {
    for (const candidate of d ? [addDays(date, -d), addDays(date, d)] : [date]) {
      const point = points.find((p) => p.date === candidate);
      if (point) return point;
    }
  }
  return undefined;
}

export function storageSummary(series: ObservationSeries | undefined): StorageSummary | null {
  const latest = series?.points.at(-1);
  if (!series || !latest) return null;
  const weekAgo = pointNear(series.points, addDays(latest.date, -7), 0);
  const lastYear = pointNear(series.points, addDays(latest.date, -365), 3);
  const yearFrom = addDays(latest.date, -364);
  return {
    latestDate: latest.date,
    fill: latest.value,
    change7d: weekAgo ? latest.value - weekAgo.value : null,
    lastYear: lastYear ? { date: lastYear.date, fill: lastYear.value } : null,
    year: series.points.filter((p) => p.date >= yearFrom),
  };
}

/** Latest fill by ISO country code, for the map. */
export function storageFills(series: ObservationSeries[], countries: { id: string }[]): Map<string, number> {
  const byId = new Map(series.map((s) => [s.id, s]));
  const fills = new Map<string, number>();
  for (const c of countries) {
    const latest = byId.get(agsiSeriesId(c.id))?.points.at(-1);
    if (latest) fills.set(c.id, latest.value);
  }
  return fills;
}
