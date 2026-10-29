import { z } from 'zod';
import type { ObservationSeries } from '../../src/types';

/** One day at one chokepoint or port, with the fields asked for by name. */
export interface DailyRow {
  date: string;
  portid: string;
  values: Record<string, number>;
}

/**
 * A query response whose rows carry `fields` as non-negative numbers: counts such as n_tanker, or
 * PortWatch's tonnage estimates such as capacity_tanker and export_tanker (metric tons).
 */
export function dailyResponseSchema(fields: readonly string[]) {
  const attributes = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      portid: z.string(),
      ...Object.fromEntries(fields.map((f) => [f, z.number().finite().min(0)])),
    })
    .transform((row): DailyRow => {
      const { date, portid, ...values } = row as { date: string; portid: string } & Record<string, number>;
      return { date, portid, values };
    });
  return z.object({ features: z.array(z.object({ attributes })), exceededTransferLimit: z.boolean().optional() });
}

import { addDays, fiveYearBaseline } from '../../src/lib/flow';

export { addDays };

/** Inclusive date ranges of at most `days` days that cover `since` to `until`, oldest first. */
export function dateWindows(since: string, until: string, days: number): Array<[string, string]> {
  const windows: Array<[string, string]> = [];
  for (let start = since; start <= until; start = addDays(start, days)) {
    const end = addDays(start, days - 1);
    windows.push([start, end < until ? end : until]);
  }
  return windows;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Daily rows for one chokepoint or port to a series of one field (n_tanker unless `field` says otherwise). Sorted, deduplicated by date,
 * trimmed to the last `keepDays`, with the five-year baseline computed from the full history
 * passed in. Throws when the series looks broken, so the old file stays.
 */
export function toTransitSeries(
  portwatchId: string,
  rows: DailyRow[],
  {
    today,
    keepDays,
    minPoints,
    maxLagDays,
    metric = 'tanker_transits',
    field = 'n_tanker',
    unit = 'tankers/day',
    id = `portwatch-${portwatchId}`,
    label,
  }: {
    today: string;
    keepDays: number;
    minPoints: number;
    maxLagDays: number;
    metric?: ObservationSeries['metric'];
    field?: string;
    unit?: string;
    id?: string;
    label?: string;
  },
): ObservationSeries {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const value = row.values[field];
    if (row.portid === portwatchId && value !== undefined) byDate.set(row.date, value);
  }
  const all = [...byDate]
    .filter(([date]) => date <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  const from = addDays(today, -keepDays);
  const points = all.filter((p) => p.date >= from);

  if (points.length < minPoints) throw new Error(`${portwatchId}: only ${points.length} days, expected at least ${minPoints}`);
  const latest = points.at(-1)!.date;
  const lag = daysBetween(latest, today);
  if (lag > maxLagDays) throw new Error(`${portwatchId}: latest day ${latest} is ${lag} days old`);

  const fiveYear = fiveYearBaseline(all, latest);
  if (!fiveYear) throw new Error(`${portwatchId}: not enough history for the five-year baseline`);
  return { id, metric, unit, ...(label ? { label } : {}), points, fiveYear };
}

/** The date every series is complete through: the earliest of their latest points. */
export function dataThrough(series: ObservationSeries[]): string | undefined {
  return series.map((s) => s.points.at(-1)?.date ?? '').sort()[0] || undefined;
}
