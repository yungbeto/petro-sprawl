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

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Daily rows for one chokepoint to a tanker-transit series. Sorted, deduplicated by date,
 * trimmed to the last `keepDays`. Throws when the series looks broken, so the old file stays.
 */
export function toTransitSeries(
  portwatchId: string,
  rows: DailyRow[],
  { today, keepDays, minPoints, maxLagDays }: { today: string; keepDays: number; minPoints: number; maxLagDays: number },
): ObservationSeries {
  const byDate = new Map<string, number>();
  for (const row of rows) if (row.portid === portwatchId) byDate.set(row.date, row.n_tanker);
  const from = addDays(today, -keepDays);
  const points = [...byDate]
    .filter(([date]) => date >= from && date <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  if (points.length < minPoints) throw new Error(`${portwatchId}: only ${points.length} days, expected at least ${minPoints}`);
  const latest = points.at(-1)!.date;
  const lag = daysBetween(latest, today);
  if (lag > maxLagDays) throw new Error(`${portwatchId}: latest day ${latest} is ${lag} days old`);

  return { id: `portwatch-${portwatchId}`, metric: 'tanker_transits', unit: 'tankers/day', points };
}

/** The date every series is complete through: the earliest of their latest points. */
export function dataThrough(series: ObservationSeries[]): string | undefined {
  return series.map((s) => s.points.at(-1)?.date ?? '').sort()[0] || undefined;
}
