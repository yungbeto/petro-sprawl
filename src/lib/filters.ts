// Quick filters (the chips over the map): which assets match, so the map can fade the rest. Pure.

import type { Selection } from '../app/urlState';
import type { Datasets } from './data';
import { lngStatus, pipelineStatus } from './encoding';
import { chokepointRows, corridorRows } from './summary';

export const FILTER_IDS = ['offline', 'below-baseline', 'unverified', 'metered', 'gas', 'oil'] as const;
export type FilterId = (typeof FILTER_IDS)[number];

export const FILTER_LABELS: Record<FilterId, string> = {
  offline: 'Offline or idle',
  'below-baseline': 'Below baseline',
  unverified: 'Unverified claims',
  metered: 'Metered flow',
  gas: 'Gas',
  oil: 'Oil',
};

/** One line under the list title, saying exactly what the filter selects. */
export const FILTER_DESCRIPTIONS: Record<FilterId, string> = {
  offline: 'Pipelines and LNG terminals whose current status is offline or idle.',
  'below-baseline': 'Chokepoints whose tanker transits over the last 7 days are below their baseline.',
  unverified: 'Corridor pipelines whose latest claim is past the aging threshold, with no metered flow to back it.',
  metered: 'Pipelines with measured ENTSOG flow, and LNG terminals with measured GIE ALSI send-out.',
  gas: 'Gas pipelines and LNG terminals.',
  oil: 'Oil pipelines, and the chokepoints, whose reference volumes are oil.',
};

export function parseFilter(value: string | null): FilterId | null {
  return (FILTER_IDS as readonly string[]).includes(value ?? '') ? (value as FilterId) : null;
}

export interface FilterMatches {
  pipelines: Set<string>;
  chokepoints: Set<string>;
  lng: Set<string>;
}

export function filterMatches(filter: FilterId, data: Datasets, now: Date): FilterMatches {
  const pipelines = (keep: (p: Datasets['pipelines'][number]) => boolean) =>
    new Set(data.pipelines.filter(keep).map((p) => p.id));
  const lng = (keep: (t: Datasets['lngTerminals'][number]) => boolean) =>
    new Set(data.lngTerminals.filter(keep).map((t) => t.id));
  const none = new Set<string>();
  switch (filter) {
    case 'offline': {
      const stopped = (status: string) => ['offline', 'idle'].includes(status);
      return {
        pipelines: pipelines((p) => stopped(pipelineStatus(p))),
        chokepoints: none,
        lng: lng((t) => stopped(lngStatus(t))),
      };
    }
    case 'below-baseline':
      return {
        pipelines: none,
        chokepoints: new Set(chokepointRows(data).filter((c) => c.band === 'below').map((c) => c.selection.id)),
        lng: none,
      };
    case 'unverified':
      return {
        pipelines: new Set(corridorRows(data.pipelines, now).filter((r) => r.unverifiedSince).map((r) => r.selection.id)),
        chokepoints: none,
        lng: none,
      };
    case 'metered':
      return {
        pipelines: pipelines((p) => p.evidence[0]?.sourceType === 'measured'),
        chokepoints: none,
        lng: lng((t) => t.evidence[0]?.sourceType === 'measured'),
      };
    case 'gas':
      return { pipelines: pipelines((p) => p.commodity === 'gas'), chokepoints: none, lng: lng(() => true) };
    case 'oil':
      return {
        pipelines: pipelines((p) => p.commodity === 'oil'),
        chokepoints: new Set(data.chokepoints.map((c) => c.id)),
        lng: none,
      };
  }
}

export function matchCount(matches: FilterMatches): number {
  return matches.pipelines.size + matches.chokepoints.size + matches.lng.size;
}

export interface FilterRow {
  selection: Selection;
  name: string;
  /** Corridor pipelines carry cited evidence; they list before plain dataset rows. */
  curated: boolean;
}

/** Matches as a list: chokepoints, then corridor pipelines, then the rest, then LNG terminals, each by name. */
export function filterRows(matches: FilterMatches, data: Datasets): FilterRow[] {
  const chokepoints = data.chokepoints
    .filter((c) => matches.chokepoints.has(c.id))
    .map((c) => ({ selection: { kind: 'chokepoint' as const, id: c.id }, name: c.name, curated: true }));
  const pipelines = data.pipelines
    .filter((p) => matches.pipelines.has(p.id))
    .map((p) => ({ selection: { kind: 'pipeline' as const, id: p.id }, name: p.name, curated: p.sources.includes('curated') }))
    .sort((a, b) => Number(b.curated) - Number(a.curated) || a.name.localeCompare(b.name));
  const terminals = data.lngTerminals
    .filter((t) => matches.lng.has(t.id))
    .map((t) => ({ selection: { kind: 'lng' as const, id: t.id }, name: t.name, curated: false }));
  return [...chokepoints.sort((a, b) => a.name.localeCompare(b.name)), ...pipelines, ...terminals];
}
