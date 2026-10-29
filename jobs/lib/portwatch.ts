import { z } from 'zod';
import type { ObservationSeries } from '../../src/types';

export const dailyRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  portid: z.string(),
  n_tanker: z.number().int().min(0),
});

export const dailyResponseSchema = z.object({
  features: z.array(z.object({ attributes: dailyRowSchema })),
  exceededTransferLimit: z.boolean().optional(),
});

export type DailyRow = z.infer<typeof dailyRowSchema>;

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
 * Daily rows for one chokepoint to a tanker-transit series. Sorted, deduplicated by date,
 * trimmed to the last `keepDays`, with the five-year baseline computed from the full history
 * passed in. Throws when the series looks broken, so the old file stays.
 */
export function toTransitSeries(
  portwatchId: string,
  rows: DailyRow[],
  { today, keepDays, minPoints, maxLagDays }: { today: string; keepDays: number; minPoints: number; maxLagDays: number },
): ObservationSeries {
  const byDate = new Map<string, number>();
  for (const row of rows) if (row.portid === portwatchId) byDate.set(row.date, row.n_tanker);
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
  return { id: `portwatch-${portwatchId}`, metric: 'tanker_transits', unit: 'tankers/day', points, fiveYear };
}

/** The date every series is complete through: the earliest of their latest points. */
export function dataThrough(series: ObservationSeries[]): string | undefined {
  return series.map((s) => s.points.at(-1)?.date ?? '').sort()[0] || undefined;
}
