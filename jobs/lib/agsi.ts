import { z } from 'zod';
import type { ObservationSeries } from '../../src/types';
import { addDays, daysBetween } from './portwatch';

/** AGSI+ sends numbers as strings, and "-" where there is no value. */
export const storageRowSchema = z.object({
  gasDayStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  full: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.string().nullable().optional(),
});

export const storageResponseSchema = z.object({
  last_page: z.number().int().nonnegative(),
  data: z.array(storageRowSchema),
});

export type StorageRow = z.infer<typeof storageRowSchema>;

function fillPct(row: StorageRow): number | null {
  if (row.status === 'N') return null;
  const value = typeof row.full === 'number' ? row.full : Number.parseFloat(row.full ?? '');
  return Number.isFinite(value) && value >= 0 && value <= 110 ? value : null;
}

/**
 * Daily rows for one country to a storage fill series (% of working gas volume).
 * Returns null when the country reports nothing usable; throws when its data stalled.
 */
export function toStorageSeries(
  id: string,
  label: string,
  rows: StorageRow[],
  { today, keepDays, maxLagDays }: { today: string; keepDays: number; maxLagDays: number },
): ObservationSeries | null {
  const from = addDays(today, -keepDays);
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const value = fillPct(row);
    if (value !== null && row.gasDayStart >= from && row.gasDayStart <= today) byDate.set(row.gasDayStart, value);
  }
  const points = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  if (!points.length) return null;
  const latest = points.at(-1)!.date;
  const lag = daysBetween(latest, today);
  if (lag > maxLagDays) throw new Error(`${id}: latest day ${latest} is ${lag} days old`);
  return { id, metric: 'storage_fill_pct', unit: '%', label, points };
}
