// Oil and gas fields in the app (M13): status, dot size, groups and links. Pure.
//
// GEM gives oil in million barrels a year and gas in million cubic metres a year, and publishes no factor
// between them, so a field is sized and ranked by its largest figure against others in the same unit:
// relative within oil or within gas, never one converted into the other.

import type { AssetStatus, Basin, Field, FieldOutput, Pipeline } from '../types';
import { FIELD_MARKER, FIELDS } from './config';
import { formatCountry } from './format';
import { kmBetween } from './refineries';
import { STATUS_GROUPS, countStatuses, statusGroups, type StatusGroupId } from './summary';

export function fieldStatus(field: Field): AssetStatus {
  return field.evidence[0]?.status ?? 'unknown';
}

export type FieldUnit = 'million bbl/y' | 'million m³/y';

/** Each unit's reference figure: the FIELD_MARKER.scalePercentile figure among every field's largest in it. */
export type FieldScale = Record<FieldUnit, number>;

const largestIn = (output: FieldOutput[], unit: FieldUnit) =>
  output.reduce<FieldOutput | null>((best, o) => (o.unit === unit && (!best || o.value > best.value) ? o : best), null);

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

const scales = new WeakMap<readonly Field[], FieldScale>();

/** Computed once per list of fields: the map, the tooltip and the list all ask for it. */
export function fieldScale(fields: readonly Field[]): FieldScale {
  const held = scales.get(fields);
  if (held) return held;
  const scale = computeScale(fields);
  scales.set(fields, scale);
  return scale;
}

function computeScale(fields: readonly Field[]): FieldScale {
  const figures = (unit: FieldUnit) => fields.flatMap((f) => largestIn(f.output, unit)?.value ?? []).filter((v) => v > 0);
  return {
    'million bbl/y': percentile(figures('million bbl/y'), FIELD_MARKER.scalePercentile),
    'million m³/y': percentile(figures('million m³/y'), FIELD_MARKER.scalePercentile),
  };
}

/**
 * The figure that sizes and ranks a field: of its largest oil figure and its largest gas figure, the one that's
 * larger against its own unit's reference. Null when GEM gives none.
 */
export function fieldLead(field: Field, scale: FieldScale): { output: FieldOutput; share: number } | null {
  const candidates = (['million bbl/y', 'million m³/y'] as const).flatMap((unit) => {
    const output = largestIn(field.output, unit);
    return output && scale[unit] > 0 ? [{ output, share: output.value / scale[unit] }] : [];
  });
  return candidates.reduce<{ output: FieldOutput; share: number } | null>((best, c) => (!best || c.share > best.share ? c : best), null);
}

/** Triangle radius by area from the lead figure's share of its unit's reference; the smallest without one. */
export function fieldRadiusPx(field: Field, scale: FieldScale): number {
  const { minPx, maxPx } = FIELD_MARKER;
  const share = fieldLead(field, scale)?.share ?? 0;
  return Math.min(maxPx, minPx + (maxPx - minPx) * Math.sqrt(Math.min(1, share)));
}

/** Largest first by lead share, then by name. */
export function byFieldSize(scale: FieldScale) {
  return (a: Field, b: Field) => (fieldLead(b, scale)?.share ?? 0) - (fieldLead(a, scale)?.share ?? 0) || a.name.localeCompare(b.name);
}

/** "Oil, 365 million barrels a year, 2024": GEM's figure, its fuel and its year, or that GEM gives no year. */
export function formatFieldOutput(o: FieldOutput): string {
  const value = o.value.toLocaleString('en-US', { maximumFractionDigits: o.value < 10 ? 2 : o.value < 100 ? 1 : 0 });
  const unit = o.unit === 'million bbl/y' ? 'million barrels a year' : 'million m³ a year';
  return `${o.fuel[0]!.toUpperCase()}${o.fuel.slice(1)}, ${value} ${unit}`;
}

export const FIELD_GROUPINGS = ['country', 'status'] as const;
export type FieldGrouping = (typeof FIELD_GROUPINGS)[number];
export const FIELD_GROUPING_LABELS: Record<FieldGrouping, string> = { country: 'Country', status: 'Status' };
export const FIELD_GROUPING_NOTES: Record<FieldGrouping, string> = {
  country: 'By the country GEM places it in. Groups with the most fields first.',
  status: "By the newest status: Global Energy Monitor's listing until a cited source.",
};

export interface FieldGroup {
  id: string;
  label: string;
  fields: Field[];
  status: { id: StatusGroupId; label: string; count: number }[];
}

function groupKey(f: Field, by: FieldGrouping): { id: string; label: string } {
  if (by === 'status') {
    const status = fieldStatus(f);
    const group = STATUS_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status))!;
    return { id: group.id, label: group.label };
  }
  return { id: `country-${f.country}`, label: formatCountry(f.country) };
}

/** Fields in groups, each listed largest first: by status in status order, by country the most fields first. */
export function fieldGroups(fields: readonly Field[], by: FieldGrouping, scale: FieldScale): FieldGroup[] {
  const buckets = new Map<string, { id: string; label: string; fields: Field[] }>();
  for (const f of fields) {
    const key = groupKey(f, by);
    const b = buckets.get(key.id) ?? { ...key, fields: [] };
    b.fields.push(f);
    buckets.set(key.id, b);
  }
  const order = byFieldSize(scale);
  const groups = [...buckets.values()].map((b) => ({ ...b, fields: [...b.fields].sort(order), status: statusGroups(countStatuses(b.fields.map(fieldStatus))) }));
  const statusOrder = (id: string) => STATUS_GROUPS.findIndex((g) => g.id === id);
  return groups.sort(by === 'status' ? (a, b) => statusOrder(a.id) - statusOrder(b.id) : (a, b) => b.fields.length - a.fields.length || a.label.localeCompare(b.label));
}

/** A province's fields, largest first. */
export function fieldsInBasin(basin: Pick<Basin, 'id'>, fields: readonly Field[], scale: FieldScale): Field[] {
  return fields.filter((f) => f.provinceId === basin.id).sort(byFieldSize(scale));
}

const endsOf = (pipeline: Pipeline): [number, number][] => {
  const lines = pipeline.geometry.type === 'LineString' ? [pipeline.geometry.coordinates] : pipeline.geometry.coordinates;
  return lines.flatMap((line) => {
    const first = line[0];
    const last = line[line.length - 1];
    return first && last ? [[first[0], first[1]] as [number, number], [last[0], last[1]] as [number, number]] : [];
  });
};

/**
 * Pipelines with an end within FIELDS.linkKm of the field, of a commodity it produces: gas lines for gas, oil
 * and NGL lines for oil. A distance, not a cited connection; the page says so.
 */
export function pipelinesNearField(field: Field, pipelines: readonly Pipeline[], km: number = FIELDS.linkKm): Pipeline[] {
  const gas = field.fuel !== 'oil';
  const oil = field.fuel === 'oil' || field.fuel === 'oil and gas';
  return pipelines
    .filter((p) => ((p.commodity === 'gas' && gas) || ((p.commodity === 'oil' || p.commodity === 'ngl') && oil)) && endsOf(p).some((end) => kmBetween(end, field.point) <= km))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fields whose point lies within FIELDS.linkKm of a pipeline's ends, of its commodity; largest first. */
export function fieldsNearPipeline(pipeline: Pipeline, fields: readonly Field[], scale: FieldScale, km: number = FIELDS.linkKm): Field[] {
  return fields.filter((f) => pipelinesNearField(f, [pipeline], km).length > 0).sort(byFieldSize(scale));
}
