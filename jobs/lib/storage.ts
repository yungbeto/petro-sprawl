// Gas in storage outside AGSI+ (SPEC M10): EIA weekly by US storage region, Statistics Canada monthly by
// province, and JODI-Gas monthly closing stocks by country. Each becomes a series of volumes in the
// source's own unit; the browser compares each with the same week or month a year earlier.

import { z } from 'zod';
import { EIA_STORAGE, JODI_GAS, STATCAN_STORAGE, eiaStorageSeriesId, jodiStorageSeriesId, statcanStorageSeriesId } from '../../src/lib/config';
import type { ObservationSeries } from '../../src/types';
import { addDays, daysBetween } from './portwatch';

type Point = ObservationSeries['points'][number];

/** First day of a "YYYY-MM" month, or the date itself, for lag checks. */
const dayOf = (period: string) => (period.length === 7 ? `${period}-01` : period);

/** Sorted points to a volume series. Throws when the newest point is older than maxLagDays. */
export function volumeSeries(
  id: string,
  label: string,
  unit: string,
  points: Point[],
  { today, maxLagDays }: { today: string; maxLagDays: number },
): ObservationSeries {
  const sorted = [...new Map(points.map((p) => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) throw new Error(`${id}: no data`);
  const lag = daysBetween(dayOf(latest.date), today);
  if (lag > maxLagDays) throw new Error(`${id}: latest period ${latest.date} is ${lag} days old`);
  return { id, metric: 'storage_gas_volume', unit, label, points: sorted };
}

// EIA

export const eiaStorageRowSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  series: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  units: z.string(),
});
export type EiaStorageRow = z.infer<typeof eiaStorageRowSchema>;

/** The Lower 48 and its five regions, in billion cubic feet, for weeks within keepDays. */
export function eiaStorageSeries(rows: EiaStorageRow[], today: string): ObservationSeries[] {
  const from = addDays(today, -EIA_STORAGE.keepDays);
  const pointsFor = (series: string): Point[] =>
    rows.flatMap((r) => {
      const value = r.value === null || r.value === '' ? NaN : Number(r.value);
      return r.series === series && r.units === 'BCF' && r.period >= from && Number.isFinite(value) && value >= 0
        ? [{ date: r.period, value }]
        : [];
    });
  const options = { today, maxLagDays: EIA_STORAGE.maxLagDays };
  return [
    volumeSeries(eiaStorageSeriesId(), EIA_STORAGE.total.name, 'Bcf', pointsFor(EIA_STORAGE.total.series), options),
    ...EIA_STORAGE.regions.map((r) => volumeSeries(eiaStorageSeriesId(r.id), r.name, 'Bcf', pointsFor(r.series), options)),
  ];
}

// Statistics Canada

const statcanPointSchema = z.object({
  refPer: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().nullable(),
  /** Powers of ten: 3 means the value is in thousands. */
  scalarFactorCode: z.number().int(),
});

export const statcanResponseSchema = z.array(
  z.object({
    status: z.string(),
    object: z.union([z.object({ coordinate: z.string(), vectorDataPoint: z.array(statcanPointSchema) }), z.string()]),
  }),
);

/** The coordinate for one geography's closing inventory in cubic metres (geography.item.unit, ten dimensions). */
export const statcanCoordinate = (member: number) =>
  [member, STATCAN_STORAGE.closingInventoryMember, STATCAN_STORAGE.cubicMetresMember, 0, 0, 0, 0, 0, 0, 0].join('.');

/** Canada and its provinces with storage, in million cubic metres by month. */
export function statcanStorageSeries(body: z.infer<typeof statcanResponseSchema>, today: string): ObservationSeries[] {
  const byCoordinate = new Map<string, Point[]>();
  for (const item of body) {
    if (item.status !== 'SUCCESS' || typeof item.object === 'string') continue;
    byCoordinate.set(
      item.object.coordinate,
      item.object.vectorDataPoint.flatMap((p) =>
        p.value === null || p.value < 0 ? [] : [{ date: p.refPer.slice(0, 7), value: (p.value * 10 ** p.scalarFactorCode) / 1e6 }],
      ),
    );
  }
  const options = { today, maxLagDays: STATCAN_STORAGE.maxLagDays };
  const one = (member: number, id: string, name: string) =>
    volumeSeries(id, name, 'million m³', byCoordinate.get(statcanCoordinate(member)) ?? [], options);
  return [
    one(STATCAN_STORAGE.total.member, statcanStorageSeriesId(), STATCAN_STORAGE.total.name),
    ...STATCAN_STORAGE.provinces.map((p) => one(p.member, statcanStorageSeriesId(p.id), p.name)),
  ];
}

// JODI

export interface JodiStorage {
  series: ObservationSeries[];
  /** Countries with recent values but none newer than maxLagDays. */
  stale: string[];
  /** Countries whose kept values are all zero: they hold no gas in storage. */
  none: string[];
}

/**
 * Closing stocks by country from JODI's world CSV, in million cubic metres by month, from fromMonth on.
 * Keeps only the assessment codes in JODI_GAS.assessments; a series is marked caution when its latest
 * value is one JODI says to use with caution.
 */
export function jodiStorageSeries(csv: string, { today, fromMonth, label }: { today: string; fromMonth: string; label: (code: string) => string }): JodiStorage {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',');
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`JODI CSV: no ${name} column`);
    return i;
  };
  const columns = {
    area: col('REF_AREA'),
    period: col('TIME_PERIOD'),
    flow: col('FLOW_BREAKDOWN'),
    unit: col('UNIT_MEASURE'),
    value: col('OBS_VALUE'),
    assessment: col('ASSESSMENT_CODE'),
  };
  const byCountry = new Map<string, (Point & { code: string })[]>();
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const get = (c: keyof typeof columns) => f[columns[c]] ?? '';
    const [area, month, code, raw] = [get('area'), get('period'), get('assessment'), get('value')];
    if (get('flow') !== JODI_GAS.flow || get('unit') !== JODI_GAS.unit || month < fromMonth) continue;
    if (!/^[A-Z]{2}$/.test(area) || !/^\d{4}-\d{2}$/.test(month)) continue;
    if (!(JODI_GAS.assessments as readonly string[]).includes(code)) continue;
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v) || v < 0) continue;
    const points = byCountry.get(area) ?? [];
    points.push({ date: month, value: v, code });
    byCountry.set(area, points);
  }
  const out: JodiStorage = { series: [], stale: [], none: [] };
  for (const [code, points] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
    if (points.every((p) => p.value === 0)) {
      out.none.push(code);
      continue;
    }
    try {
      const series = volumeSeries(
        jodiStorageSeriesId(code),
        label(code),
        'million m³',
        points.map(({ date, value }) => ({ date, value })),
        { today, maxLagDays: JODI_GAS.maxLagDays },
      );
      const latest = points.reduce((a, b) => (b.date > a.date ? b : a));
      out.series.push(latest.code === '2' ? { ...series, caution: true } : series);
    } catch {
      out.stale.push(code);
    }
  }
  return out;
}
