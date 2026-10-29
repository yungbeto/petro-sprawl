import { z } from 'zod';
import type { ObservationSeries } from '../../src/types';
import { addDays, daysBetween } from './portwatch';

/** ALSI sends numbers as strings, and "-" where there is no value. Send-out and capacity are GWh/d. */
export const sendOutRowSchema = z.object({
  gasDayStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sendOut: z.union([z.string(), z.number()]).nullable().optional(),
  dtrs: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.string().nullable().optional(),
});

export const sendOutResponseSchema = z.object({
  last_page: z.number().int().nonnegative(),
  data: z.array(sendOutRowSchema),
});

export type SendOutRow = z.infer<typeof sendOutRowSchema>;

const GWH = 1e6;

function gwh(raw: string | number | null | undefined): number | null {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(raw ?? '');
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Daily rows for the ALSI facilities of one terminal to a send-out series in kWh/d, the unit of
 * ENTSOG flows. Facilities add up by day; capacity is the sum of each facility's latest declared
 * send-out (DTRS). Returns null when nothing usable came back; throws when the data stalled.
 */
export function toSendOutSeries(
  id: string,
  label: string,
  facilities: SendOutRow[][],
  { today, keepDays, maxLagDays }: { today: string; keepDays: number; maxLagDays: number },
): ObservationSeries | null {
  const from = addDays(today, -keepDays);
  const byDate = new Map<string, number>();
  let capacity = 0;
  for (const rows of facilities) {
    let latestCapacity: { date: string; value: number } | null = null;
    for (const row of rows) {
      if (row.gasDayStart < from || row.gasDayStart > today || row.status === 'N') continue;
      const sent = gwh(row.sendOut);
      if (sent !== null) byDate.set(row.gasDayStart, (byDate.get(row.gasDayStart) ?? 0) + sent * GWH);
      const dtrs = gwh(row.dtrs);
      if (dtrs !== null && (!latestCapacity || row.gasDayStart > latestCapacity.date)) latestCapacity = { date: row.gasDayStart, value: dtrs };
    }
    capacity += (latestCapacity?.value ?? 0) * GWH;
  }
  const points = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  if (!points.length) return null;
  const latest = points.at(-1)!.date;
  const lag = daysBetween(latest, today);
  if (lag > maxLagDays) throw new Error(`${id}: latest day ${latest} is ${lag} days old`);
  return { id, metric: 'lng_sendout_kwh_d', unit: 'kWh/d', label, points, ...(capacity > 0 ? { capacity } : {}) };
}
