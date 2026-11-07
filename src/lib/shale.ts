// Shale plays (SPEC M12), as the panel reads them: each EIA formation with its outlines and its monthly
// oil and gas, a region's rigs and wells, the plays in a USGS province, and the summary line. EIA reports
// production by formation, not by area, so a figure always belongs to the formation. Pure.

import { SHALE, type ShaleFormationId, type ShaleRegionId } from './config';
import type { ShalePlay, ShaleSeries } from '../types';

export type ShaleFormation = (typeof SHALE.formations)[number];
export type ShaleRegion = (typeof SHALE.regions)[number];

interface ShaleData {
  shalePlays: ShalePlay[];
  shaleSeries: ShaleSeries[];
}

export function shaleSeries(data: Pick<ShaleData, 'shaleSeries'>, id: string | undefined): ShaleSeries | undefined {
  return id ? data.shaleSeries.find((s) => s.id === id) : undefined;
}

export function formationById(id: string | undefined): ShaleFormation | undefined {
  return SHALE.formations.find((f) => f.id === id);
}

/** The newest month of a series, and the change over the year before it when that month is there. */
export function latestMonth(series: ShaleSeries | undefined): { period: string; value: number; yearAgo: number | null } | null {
  const last = series?.points.at(-1);
  if (!series || !last) return null;
  const [y, m] = last.period.split('-');
  const yearAgo = series.points.find((p) => p.period === `${Number(y) - 1}-${m}`)?.value ?? null;
  return { period: last.period, value: last.value, yearAgo };
}

export interface FormationRow {
  formation: ShaleFormation;
  oil: ShaleSeries | undefined;
  gas: ShaleSeries | undefined;
  /** Its outlines, largest first; empty when EIA's map has none. */
  plays: ShalePlay[];
}

/**
 * EIA's formations, those with tight oil first by their latest month, then gas-only ones by gas. A formation
 * with no series loaded stays out: it has nothing to show.
 */
export function formationRows(data: ShaleData): FormationRow[] {
  const latest = (s: ShaleSeries | undefined) => s?.points.at(-1)?.value ?? -1;
  return SHALE.formations
    .map((formation) => ({
      formation,
      oil: shaleSeries(data, 'oil' in formation ? formation.oil : undefined),
      gas: shaleSeries(data, 'gas' in formation ? formation.gas : undefined),
      plays: data.shalePlays.filter((p) => p.formation === formation.id).sort((a, b) => b.areaKm2 - a.areaKm2),
    }))
    .filter((r) => r.oil || r.gas)
    .sort((a, b) => (a.oil || b.oil ? latest(b.oil) - latest(a.oil) : latest(b.gas) - latest(a.gas)));
}

/** Outlines EIA draws but reports no formation for (or whose coverage isn't confirmed), largest first. */
export function playsWithoutFormation(plays: ShalePlay[]): ShalePlay[] {
  return plays.filter((p) => !p.formation).sort((a, b) => b.areaKm2 - a.areaKm2);
}

/** The plays EIA names with the same formation, other than this one: they share its figure. */
export function sharingPlays(play: ShalePlay, plays: ShalePlay[]): ShalePlay[] {
  return play.formation ? plays.filter((p) => p.formation === play.formation && p.id !== play.id).sort((a, b) => b.areaKm2 - a.areaKm2) : [];
}

export function playsInProvince(provinceId: string, plays: ShalePlay[]): ShalePlay[] {
  return plays.filter((p) => p.provinceId === provinceId).sort((a, b) => b.areaKm2 - a.areaKm2);
}

export interface RegionActivity {
  region: ShaleRegion;
  rigs: ShaleSeries | undefined;
  wellsDrilled: ShaleSeries | undefined;
  wellsCompleted: ShaleSeries | undefined;
  uncompleted: ShaleSeries | undefined;
}

/** A formation's EIA shale region (the old Drilling Productivity Report's), with its rigs and wells. */
export function regionActivity(data: Pick<ShaleData, 'shaleSeries'>, formation: ShaleFormation | undefined): RegionActivity | null {
  const id = formation && 'region' in formation ? (formation.region as ShaleRegionId) : undefined;
  const region = SHALE.regions.find((r) => r.id === id);
  if (!region) return null;
  const of = (key: keyof typeof SHALE.activity) => shaleSeries(data, `${SHALE.activity[key]}${region.code}`);
  const activity = { region, rigs: of('rigs'), wellsDrilled: of('wellsDrilled'), wellsCompleted: of('wellsCompleted'), uncompleted: of('uncompleted') };
  return activity.rigs || activity.wellsCompleted || activity.uncompleted ? activity : null;
}

export interface ShaleSummary {
  period: string;
  oil: number;
  gas: number | null;
  /** The formation with the most tight oil, and its share of the Lower 48's. */
  largest: { label: string; share: number } | null;
  release: string;
}

/** The Lower 48's tight oil and shale gas in the newest month, and the largest formation's share of the oil. */
export function shaleSummary(data: ShaleData): ShaleSummary | null {
  const oil = latestMonth(shaleSeries(data, SHALE.totals.oil));
  if (!oil) return null;
  const gas = shaleSeries(data, SHALE.totals.gas);
  const gasSame = gas?.points.find((p) => p.period === oil.period)?.value ?? null;
  const top = formationRows(data).find((r) => r.oil);
  const topValue = top?.oil?.points.find((p) => p.period === oil.period)?.value;
  return {
    period: oil.period,
    oil: oil.value,
    gas: gasSame,
    largest: top && topValue !== undefined && oil.value > 0 ? { label: top.formation.label, share: topValue / oil.value } : null,
    release: shaleSeries(data, SHALE.totals.oil)!.release,
  };
}

/** A formation's lead figure: its tight oil where EIA reports one, else its shale gas. */
export function leadSeries(data: Pick<ShaleData, 'shaleSeries'>, formation: ShaleFormation | undefined): ShaleSeries | undefined {
  if (!formation) return undefined;
  return shaleSeries(data, 'oil' in formation ? formation.oil : undefined) ?? shaleSeries(data, 'gas' in formation ? formation.gas : undefined);
}

/** The newest month against the same month a year earlier, in percent; null without both. */
export function yearChangePct(latest: ReturnType<typeof latestMonth>): number | null {
  return latest && latest.yearAgo ? ((latest.value - latest.yearAgo) / latest.yearAgo) * 100 : null;
}

/** A series as chart points, labelled by month ("2026-09"). */
export function chartPoints(series: ShaleSeries): { date: string; value: number }[] {
  return series.points.map((p) => ({ date: p.period, value: p.value }));
}

/** EIA's units in the app's words. */
export function shaleUnit(series: Pick<ShaleSeries, 'kind' | 'unit'>): string {
  if (series.kind === 'oil') return 'million barrels of oil a day';
  if (series.kind === 'gas') return 'billion ft³ of gas a day';
  return '';
}

/** Oil to two decimals (6.17), gas to one (23.5), counts whole. */
export function formatShaleValue(series: Pick<ShaleSeries, 'kind'>, value: number): string {
  const digits = series.kind === 'oil' ? 2 : series.kind === 'gas' ? 1 : 0;
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export type { ShaleFormationId };
