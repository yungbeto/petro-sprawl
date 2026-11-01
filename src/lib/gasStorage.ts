// Gas storage by country (SPEC M10): one source per country, its latest figure, the change since the
// period before, and the same day, week or month a year earlier.

import type { ObservationSeries } from '../types';
import {
  AGSI,
  EIA_STORAGE,
  STATCAN_STORAGE,
  STORAGE_MAP,
  STORAGE_SOURCES,
  agsiSeriesId,
  eiaStorageSeriesId,
  jodiStorageSeriesId,
  statcanStorageSeriesId,
  type StorageSourceId,
} from './config';
import { mixColors, type Rgba } from './color';
import { addDays } from './flow';
import { formatNumber, formatStorageVolume } from './format';

type Point = ObservationSeries['points'][number];

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
function pointNear(points: Point[], date: string, toleranceDays: number) {
  for (let d = 0; d <= toleranceDays; d++) {
    for (const candidate of d ? [addDays(date, -d), addDays(date, d)] : [date]) {
      const point = points.find((p) => p.date === candidate);
      if (point) return point;
    }
  }
  return undefined;
}

/** "2026-08" moved by n months. */
export function addMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** AGSI+ fill: the latest, the 7-day change and the same date last year. */
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

export type Cadence = (typeof STORAGE_SOURCES)[StorageSourceId]['cadence'];

export interface PeriodSummary {
  latest: Point;
  /** The point before: 7 days back for daily data, the week or month before otherwise. */
  previous: Point | null;
  /** The same day (within 3), week or month a year earlier. */
  lastYear: Point | null;
  /** The last 12 months of points, for the chart. */
  year: Point[];
}

/** Latest, previous and last year's points of a daily, weekly or monthly series. */
export function periodSummary(series: ObservationSeries | undefined, cadence: Cadence): PeriodSummary | null {
  const latest = series?.points.at(-1);
  if (!series || !latest) return null;
  const { points } = series;
  if (cadence === 'monthly') {
    const at = (month: string) => points.find((p) => p.date === month) ?? null;
    const yearFrom = addMonths(latest.date, -11);
    return { latest, previous: at(addMonths(latest.date, -1)), lastYear: at(addMonths(latest.date, -12)), year: points.filter((p) => p.date >= yearFrom) };
  }
  // A year back is 52 weeks for weekly data, so the same weekday; 365 days for daily data.
  const lastYear = cadence === 'weekly' ? pointNear(points, addDays(latest.date, -364), 3) : pointNear(points, addDays(latest.date, -365), 3);
  const yearFrom = addDays(latest.date, -364);
  return {
    latest,
    previous: pointNear(points, addDays(latest.date, -7), 0) ?? null,
    lastYear: lastYear ?? null,
    year: points.filter((p) => p.date >= yearFrom),
  };
}

/** Percent more (positive) or less gas than at the same point last year; null when last year was empty or missing. */
export function vsLastYearPct(summary: PeriodSummary | null): number | null {
  if (!summary?.lastYear || summary.lastYear.value <= 0) return null;
  return (summary.latest.value / summary.lastYear.value - 1) * 100;
}

export interface CountryStorage {
  /** ISO 3166 alpha-2. */
  country: string;
  source: StorageSourceId;
  cadence: Cadence;
  /** Fill for AGSI+ (%), gas in storage otherwise, in `series.unit`. */
  series: ObservationSeries;
  summary: PeriodSummary;
  /** AGSI+ only: percent of working gas volume. */
  fill: number | null;
  vsLastYearPct: number | null;
  /** Regions (US) or provinces (Canada), largest first. */
  parts: { id: string; name: string; series: ObservationSeries; summary: PeriodSummary }[];
  /** JODI flags the latest value as one to use with caution. */
  caution: boolean;
}

/** The series ids each source keeps for a country, in the order sources are preferred. */
function candidates(country: string): { source: StorageSourceId; id: string; parts: { id: string; name: string; seriesId: string }[] }[] {
  const out: ReturnType<typeof candidates> = [];
  if ((AGSI.countries as readonly string[]).includes(country)) out.push({ source: 'agsi', id: agsiSeriesId(country), parts: [] });
  if (country === 'US')
    out.push({ source: 'eia', id: eiaStorageSeriesId(), parts: EIA_STORAGE.regions.map((r) => ({ id: r.id, name: r.name, seriesId: eiaStorageSeriesId(r.id) })) });
  if (country === 'CA')
    out.push({
      source: 'statcan',
      id: statcanStorageSeriesId(),
      parts: STATCAN_STORAGE.provinces.map((p) => ({ id: p.id, name: p.name, seriesId: statcanStorageSeriesId(p.id) })),
    });
  out.push({ source: 'jodi', id: jodiStorageSeriesId(country), parts: [] });
  return out;
}

/** One country's storage, from the first source that has it, or null. */
export function countryStorage(byId: Map<string, ObservationSeries>, country: string): CountryStorage | null {
  for (const candidate of candidates(country)) {
    const series = byId.get(candidate.id);
    const cadence = STORAGE_SOURCES[candidate.source].cadence;
    const summary = periodSummary(series, cadence);
    if (!series || !summary) continue;
    const parts = candidate.parts
      .flatMap((p) => {
        const s = byId.get(p.seriesId);
        const sum = periodSummary(s, cadence);
        return s && sum ? [{ id: p.id, name: p.name, series: s, summary: sum }] : [];
      })
      .sort((a, b) => b.summary.latest.value - a.summary.latest.value);
    return {
      country,
      source: candidate.source,
      cadence,
      series,
      summary,
      fill: candidate.source === 'agsi' ? summary.latest.value : null,
      vsLastYearPct: vsLastYearPct(summary),
      parts,
      caution: series.caution === true,
    };
  }
  return null;
}

const STORAGE_PREFIXES = ['agsi-', 'eia-storage-us', 'statcan-storage-ca', 'jodi-storage-'];

/** Every country with a storage series, keyed by ISO code. */
export function storageByCountry(series: ObservationSeries[]): Map<string, CountryStorage> {
  const byId = new Map(series.filter((s) => STORAGE_PREFIXES.some((p) => s.id.startsWith(p))).map((s) => [s.id, s]));
  const countries = new Set<string>(AGSI.countries);
  if (byId.has(eiaStorageSeriesId())) countries.add('US');
  if (byId.has(statcanStorageSeriesId())) countries.add('CA');
  for (const id of byId.keys()) if (id.startsWith('jodi-storage-')) countries.add(id.slice('jodi-storage-'.length).toUpperCase());
  const out = new Map<string, CountryStorage>();
  for (const country of [...countries].sort()) {
    const storage = countryStorage(byId, country);
    if (storage) out.set(country, storage);
  }
  return out;
}

/** A country's map fill: magenta for less gas than a year ago, blue for more, neutral when even or not known. */
export function storageColor(
  storage: Pick<CountryStorage, 'vsLastYearPct'> | undefined,
  colors: { storageLess: Rgba; storageEven: Rgba; storageMore: Rgba; storageNone: Rgba },
): Rgba {
  if (!storage) return colors.storageNone;
  if (storage.vsLastYearPct === null) return colors.storageEven;
  const t = Math.max(-1, Math.min(1, storage.vsLastYearPct / STORAGE_MAP.vsLastYearPctRange));
  return t < 0 ? mixColors(colors.storageEven, colors.storageLess, -t) : mixColors(colors.storageEven, colors.storageMore, t);
}

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;

/** The headline figure: fill for AGSI+ countries, gas in storage for the rest. */
export function storageFigure(s: Pick<CountryStorage, 'fill' | 'summary' | 'series'>): string {
  return s.fill !== null ? `${formatNumber(s.fill, 1)}%` : formatStorageVolume(s.summary.latest.value, s.series.unit);
}

/** The change since the period before, in the series' own terms, with the period unless `bare`. */
export function storageChange(s: Pick<CountryStorage, 'fill' | 'summary' | 'series' | 'cadence'>, bare = false): string | null {
  const { latest, previous } = s.summary;
  if (!previous) return null;
  const delta = latest.value - previous.value;
  const change = s.fill !== null ? pts(delta) : `${delta >= 0 ? '+' : '−'}${formatStorageVolume(Math.abs(delta), s.series.unit)}`;
  return bare ? change : `${change} ${CHANGE_SPAN[s.cadence]}`;
}

const CHANGE_SPAN: Record<Cadence, string> = { daily: 'in 7 days', weekly: 'on the week', monthly: 'on the month' };
/** What the change is over, as a label. */
export const CHANGE_LABEL: Record<Cadence, string> = { daily: 'Last 7 days', weekly: 'On the week', monthly: 'On the month' };

/** What the headline figure is, before its date. */
export const STORAGE_HEADLINE: Record<StorageSourceId, string> = {
  agsi: 'of working gas volume in storage on',
  eia: 'of working gas in storage, week to',
  statcan: 'of gas in storage at the end of',
  jodi: 'of gas in stock at the end of',
};
