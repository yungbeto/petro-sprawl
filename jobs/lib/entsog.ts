import { z } from 'zod';
import type { ObservationSeries } from '../../src/types';
import { addDays, daysBetween } from './portwatch';

export const operationalRowSchema = z.object({
  indicator: z.string(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  pointKey: z.string(),
  operatorKey: z.string(),
  directionKey: z.string(),
  unit: z.string(),
  value: z.number().nullable(),
});

export const operationalResponseSchema = z.object({ operationaldatas: z.array(operationalRowSchema) });

export type OperationalRow = z.infer<typeof operationalRowSchema>;

/** Gas day of a row. ENTSOG gives periodFrom in the operator's local time, so the date part is the gas day. */
const gasDay = (row: OperationalRow) => row.periodFrom.slice(0, 10);

/** Rows for one point to daily totals. A point can report several items per day (one per TSO item); they add up. */
export function dailyTotals(rows: OperationalRow[], unit = 'kWh/d'): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (row.value === null) continue;
    if (row.unit !== unit) throw new Error(`${row.pointKey}: unexpected unit ${row.unit}`);
    byDate.set(gasDay(row), (byDate.get(gasDay(row)) ?? 0) + row.value);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/**
 * Physical-flow rows plus firm technical capacity rows for one point to a gas-flow series.
 * Throws when the series looks broken, so the old file stays.
 */
export function toFlowSeries(
  id: string,
  label: string,
  flowRows: OperationalRow[],
  capacityRows: OperationalRow[],
  { today, keepDays, maxLagDays }: { today: string; keepDays: number; maxLagDays: number },
): ObservationSeries {
  const from = addDays(today, -keepDays);
  const points = dailyTotals(flowRows).filter((p) => p.date >= from && p.date <= today);
  if (!points.length) throw new Error(`${id}: no physical flow data`);
  const latest = points.at(-1)!.date;
  const lag = daysBetween(latest, today);
  if (lag > maxLagDays) throw new Error(`${id}: latest day ${latest} is ${lag} days old`);
  const capacity = dailyTotals(capacityRows).filter((p) => p.date <= today).at(-1)?.value;
  return {
    id,
    metric: 'gas_flow_kwh_d',
    unit: 'kWh/d',
    label,
    points,
    ...(capacity && capacity > 0 ? { capacity } : {}),
  };
}
