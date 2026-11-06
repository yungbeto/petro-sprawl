// Refineries in the app (M11): the surface's groups, and the links to pipelines and regions. Pure.

import type { Pipeline, Refinery } from '../types';
import { PADDS, REFINERIES } from './config';
import { refineryStatus } from './encoding';
import { formatCountry } from './format';
import { STATUS_GROUPS, countStatuses, statusGroups, type StatusGroupId } from './summary';

export const REFINERY_GROUPINGS = ['region', 'company', 'status'] as const;
export type RefineryGrouping = (typeof REFINERY_GROUPINGS)[number];

export const REFINERY_GROUPING_LABELS: Record<RefineryGrouping, string> = { region: 'Region', company: 'Company', status: 'Status' };

export const REFINERY_GROUPING_NOTES: Record<RefineryGrouping, string> = {
  region: "In the US by EIA's region (PADD); elsewhere by country.",
  company: 'By the parent company EIA names, or the operator where it names none.',
  status: "By the newest status: in the US, EIA's split of capacity into operating and idle on 1 January; in Europe unknown until a cited source.",
};

export interface RefineryGroup {
  id: string;
  label: string;
  refineries: Refinery[];
  /** Crude distillation capacity of the group's refineries that have one, in barrels a day. */
  capacity: number;
  status: { id: StatusGroupId; label: string; count: number }[];
}

const capacityOf = (r: Refinery) => r.capacity?.value ?? 0;

/** Largest first by capacity, then by name. */
export const byCapacity = (a: Refinery, b: Refinery) => capacityOf(b) - capacityOf(a) || a.name.localeCompare(b.name);

export function paddName(padd: number): string {
  const name = PADDS.find((p) => p.id === `padd-${padd}`)?.name;
  return name ? `${name} (PADD ${padd})` : `PADD ${padd}`;
}

function groupKey(r: Refinery, by: RefineryGrouping): { id: string; label: string } {
  if (by === 'status') {
    const status = refineryStatus(r);
    const group = STATUS_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status))!;
    return { id: group.id, label: group.label };
  }
  if (by === 'company') {
    const name = r.corporation ?? r.operator;
    return name ? { id: `company-${name.toLowerCase()}`, label: name } : { id: 'unknown', label: 'Company unknown' };
  }
  if (r.country === 'US' && r.padd) return { id: `padd-${r.padd}`, label: paddName(r.padd) };
  return { id: `country-${r.country}`, label: formatCountry(r.country) };
}

/**
 * Refineries in groups, each listed largest first. Groups by status keep the status order; the others
 * go by total capacity, largest first, with the unknown group last.
 */
export function refineryGroups(refineries: Refinery[], by: RefineryGrouping): RefineryGroup[] {
  const buckets = new Map<string, { id: string; label: string; refineries: Refinery[] }>();
  for (const r of refineries) {
    const key = groupKey(r, by);
    const b = buckets.get(key.id) ?? { ...key, refineries: [] };
    b.refineries.push(r);
    buckets.set(key.id, b);
  }
  const groups = [...buckets.values()].map((b) => ({
    ...b,
    refineries: [...b.refineries].sort(byCapacity),
    capacity: b.refineries.reduce((sum, r) => sum + capacityOf(r), 0),
    status: statusGroups(countStatuses(b.refineries.map(refineryStatus))),
  }));
  const statusOrder = (id: string) => STATUS_GROUPS.findIndex((g) => g.id === id);
  return groups.sort(
    by === 'status'
      ? (a, b) => statusOrder(a.id) - statusOrder(b.id)
      : (a, b) =>
          Number(a.id === 'unknown') - Number(b.id === 'unknown') ||
          b.capacity - a.capacity ||
          b.refineries.length - a.refineries.length ||
          a.label.localeCompare(b.label),
  );
}

/** Great-circle distance in kilometres. */
export function kmBetween([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A pipeline's end points: the first and last point of each of its lines. */
function endsOf(pipeline: Pipeline): [number, number][] {
  const lines = pipeline.geometry.type === 'LineString' ? [pipeline.geometry.coordinates] : pipeline.geometry.coordinates;
  return lines.flatMap((line) => {
    const first = line[0];
    const last = line[line.length - 1];
    return first && last ? [[first[0], first[1]] as [number, number], [last[0], last[1]] as [number, number]] : [];
  });
}

const endsNear = (pipeline: Pipeline, point: [number, number], km: number) => endsOf(pipeline).some((end) => kmBetween(end, point) <= km);

/** Oil and products pipelines with an end within `REFINERIES.linkKm` of the refinery. Gas lines don't feed one. */
export function pipelinesAtRefinery(refinery: Refinery, pipelines: Pipeline[], km: number = REFINERIES.linkKm): Pipeline[] {
  return pipelines.filter((p) => p.commodity !== 'gas' && endsNear(p, refinery.point, km)).sort((a, b) => a.name.localeCompare(b.name));
}

/** The refineries within `REFINERIES.linkKm` of an oil or products pipeline's ends, largest first. */
export function refineriesAtPipeline(pipeline: Pipeline, refineries: Refinery[], km: number = REFINERIES.linkKm): Refinery[] {
  if (pipeline.commodity === 'gas') return [];
  return refineries.filter((r) => endsNear(pipeline, r.point, km)).sort(byCapacity);
}

/** A US region's refineries, largest first. */
export function refineriesInPadd(refineries: Refinery[], padd: number): Refinery[] {
  return refineries.filter((r) => r.country === 'US' && r.padd === padd).sort(byCapacity);
}
