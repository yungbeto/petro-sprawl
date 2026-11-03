// The pipelines surface: every pipeline grouped by region, status, commodity or owner. Pure.

import { PIPELINE_GROUPS } from './config';
import { pipelineStatus } from './encoding';
import { STATUS_GROUPS, statusCounts, statusGroups, type StatusGroupId } from './summary';
import type { Commodity, CountryRegion, Pipeline } from '../types';

export const PIPELINE_GROUPINGS = ['region', 'status', 'commodity', 'owner'] as const;
export type PipelineGrouping = (typeof PIPELINE_GROUPINGS)[number];

export const PIPELINE_GROUPING_LABELS: Record<PipelineGrouping, string> = {
  region: 'Region',
  status: 'Status',
  commodity: 'Commodity',
  owner: 'Owner',
};

/** What each grouping groups by, shown under the switch. */
export const PIPELINE_GROUPING_NOTES: Record<PipelineGrouping, string> = {
  region: 'By the country each line starts in.',
  status: "By the status on the map: measured flow or a cited claim where there is one, otherwise Global Energy Monitor's.",
  commodity: 'By what the line carries, as Global Energy Monitor lists it.',
  owner: 'By the company with the largest share, as Global Energy Monitor traces it.',
};

const COMMODITY_ORDER: Commodity[] = ['gas', 'oil', 'products', 'ngl'];
const COMMODITY_GROUP_LABELS: Record<Commodity, string> = {
  gas: 'Gas',
  oil: 'Crude oil',
  products: 'Refined products',
  ngl: 'Natural gas liquids',
};

export interface PipelineGroup {
  id: string;
  label: string;
  /** Researched pipelines first, then by name. */
  pipelines: Pipeline[];
  status: { id: StatusGroupId; label: string; count: number }[];
}

/** Researched: a curated record with cited claims, or metered flow. */
export const isResearched = (p: Pipeline) => p.sources.includes('curated');

/** The company with the largest share: GEM's ultimate parent where it traces one, else the direct owner. */
export function leadOwner(p: Pipeline): string | null {
  const pick = (list?: { name: string; sharePct?: number }[]) =>
    [...(list ?? [])].filter((o) => o.name && o.name.toLowerCase() !== 'unknown').sort((a, b) => (b.sharePct ?? 0) - (a.sharePct ?? 0))[0]?.name;
  return pick(p.parents) ?? pick(p.owners) ?? null;
}

/** "Europe & Central Asia" reads "Europe and Central Asia". */
export const regionLabel = (region: string) => region.replace(' & ', ' and ');

/**
 * Pipelines in groups. Region goes by the country a line starts in. Region and owner groups come
 * largest first, with unknowns last; status and commodity keep a fixed order. Owners past the
 * largest `ownerGroups` share one "Other owners" group.
 */
export function pipelineGroups(pipelines: Pipeline[], by: PipelineGrouping, regions: CountryRegion[]): PipelineGroup[] {
  const regionOf = new Map(regions.map((r) => [r.id, r.region]));
  const buckets = new Map<string, { label: string; pipelines: Pipeline[] }>();
  const add = (id: string, label: string, p: Pipeline) => {
    const bucket = buckets.get(id) ?? { label, pipelines: [] };
    bucket.pipelines.push(p);
    buckets.set(id, bucket);
  };
  for (const p of pipelines) {
    switch (by) {
      case 'region': {
        const region = regionOf.get(p.fromCountry);
        add(region ?? 'unknown', region ? regionLabel(region) : 'Region unknown', p);
        break;
      }
      case 'status': {
        const status = pipelineStatus(p);
        const group = STATUS_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status))!;
        add(group.id, group.label, p);
        break;
      }
      case 'commodity':
        add(p.commodity, COMMODITY_GROUP_LABELS[p.commodity], p);
        break;
      case 'owner': {
        const owner = leadOwner(p);
        add(owner ?? 'unknown', owner ?? 'Owner unknown', p);
        break;
      }
    }
  }

  let entries = [...buckets].map(([id, b]) => ({ id, ...b }));
  if (by === 'owner') {
    const known = entries.filter((e) => e.id !== 'unknown').sort((a, b) => b.pipelines.length - a.pipelines.length || a.label.localeCompare(b.label));
    const kept = known.slice(0, PIPELINE_GROUPS.ownerGroups);
    const rest = known.slice(PIPELINE_GROUPS.ownerGroups).flatMap((e) => e.pipelines);
    entries = [
      ...kept,
      ...(rest.length ? [{ id: 'other', label: 'Other owners', pipelines: rest }] : []),
      ...entries.filter((e) => e.id === 'unknown'),
    ];
  } else if (by === 'region') {
    entries.sort((a, b) => Number(a.id === 'unknown') - Number(b.id === 'unknown') || b.pipelines.length - a.pipelines.length);
  } else {
    const order: string[] = by === 'status' ? STATUS_GROUPS.map((g) => g.id) : COMMODITY_ORDER;
    entries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  return entries.map((e) => ({
    id: e.id,
    label: e.label,
    pipelines: [...e.pipelines].sort((a, b) => Number(isResearched(b)) - Number(isResearched(a)) || a.name.localeCompare(b.name)),
    status: statusGroups(statusCounts(e.pipelines)),
  }));
}
