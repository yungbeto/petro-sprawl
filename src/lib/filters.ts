// Quick filters (the chips over the map): which assets match, so the map can fade the rest. Pure.

import type { Selection } from '../app/urlState';
import type { Datasets } from './data';
import { lngStatus, pipelineStatus, refineryStatus, terminalStatus } from './encoding';
import { isUnverified, statusBasis, type StatusBasis } from './evidence';
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
  offline:
    'Pipelines, LNG terminals, oil terminals and refineries whose current status is offline or idle. Measured or reported stops list first; the rest are a dataset\'s listing, not a report of current operation.',
  'below-baseline': 'Chokepoints whose tanker transits over the last 7 days are below their baseline.',
  unverified: 'Corridor pipelines and oil terminals whose latest claim is past the aging threshold, with no metered flow to back it.',
  metered: 'Pipelines with measured ENTSOG flow, and LNG terminals with measured GIE ALSI send-out.',
  gas: 'Gas pipelines and LNG terminals.',
  oil: 'Oil pipelines, oil terminals, refineries, and the chokepoints, whose reference volumes are oil.',
};

export function parseFilter(value: string | null): FilterId | null {
  return (FILTER_IDS as readonly string[]).includes(value ?? '') ? (value as FilterId) : null;
}

export interface FilterMatches {
  pipelines: Set<string>;
  chokepoints: Set<string>;
  lng: Set<string>;
  terminals: Set<string>;
  refineries: Set<string>;
}

export function filterMatches(filter: FilterId, data: Datasets, now: Date): FilterMatches {
  const pipelines = (keep: (p: Datasets['pipelines'][number]) => boolean) =>
    new Set(data.pipelines.filter(keep).map((p) => p.id));
  const lng = (keep: (t: Datasets['lngTerminals'][number]) => boolean) =>
    new Set(data.lngTerminals.filter(keep).map((t) => t.id));
  const terminals = (keep: (t: Datasets['oilTerminals'][number]) => boolean) =>
    new Set(data.oilTerminals.filter(keep).map((t) => t.id));
  const refineries = (keep: (r: Datasets['refineries'][number]) => boolean) => new Set(data.refineries.filter(keep).map((r) => r.id));
  const none = new Set<string>();
  switch (filter) {
    case 'offline': {
      const stopped = (status: string) => ['offline', 'idle'].includes(status);
      return {
        pipelines: pipelines((p) => stopped(pipelineStatus(p))),
        chokepoints: none,
        lng: lng((t) => stopped(lngStatus(t))),
        terminals: terminals((t) => stopped(terminalStatus(t))),
        refineries: refineries((r) => stopped(refineryStatus(r))),
      };
    }
    case 'below-baseline':
      return {
        pipelines: none,
        chokepoints: new Set(chokepointRows(data).filter((c) => c.band === 'below').map((c) => c.selection.id)),
        lng: none,
        terminals: none,
        refineries: none,
      };
    case 'unverified':
      return {
        pipelines: new Set(corridorRows(data.pipelines, now).filter((r) => r.unverifiedSince).map((r) => r.selection.id)),
        chokepoints: none,
        lng: none,
        terminals: terminals((t) => isUnverified(t.evidence[0], now)),
        refineries: none,
      };
    case 'metered':
      return {
        pipelines: pipelines((p) => p.evidence[0]?.sourceType === 'measured'),
        chokepoints: none,
        lng: lng((t) => t.evidence[0]?.sourceType === 'measured'),
        terminals: none,
        refineries: none,
      };
    case 'gas':
      return { pipelines: pipelines((p) => p.commodity === 'gas'), chokepoints: none, lng: lng(() => true), terminals: none, refineries: none };
    case 'oil':
      return {
        pipelines: pipelines((p) => p.commodity === 'oil'),
        chokepoints: new Set(data.chokepoints.map((c) => c.id)),
        lng: none,
        terminals: terminals(() => true),
        refineries: refineries(() => true),
      };
  }
}

export function matchCount(matches: FilterMatches): number {
  return matches.pipelines.size + matches.chokepoints.size + matches.lng.size + matches.terminals.size + matches.refineries.size;
}

export interface FilterRow {
  selection: Selection;
  name: string;
  /** Corridor pipelines carry cited evidence; they list before plain dataset rows. */
  curated: boolean;
  /** What its status rests on, in filter lists; chokepoints count as measured (their tanker transits). */
  basis?: StatusBasis;
}

export interface FilterGroup {
  title: string;
  rows: FilterRow[];
}

/**
 * The offline list split by what each status rests on: measured or reported first, then what a dataset
 * only lists (most of GEM's idle and retired lines), so a cited stop never hides among database labels.
 * One group, untitled, when everything rests on the same kind of source. Pure.
 */
export function groupByBasis(rows: FilterRow[]): FilterGroup[] {
  const cited = rows.filter((r) => r.basis === 'measured' || r.basis === 'reported');
  const listed = rows.filter((r) => !cited.includes(r));
  if (!cited.length || !listed.length) return [{ title: '', rows }];
  return [
    { title: 'Measured or reported', rows: cited },
    { title: 'Listed in a dataset only', rows: listed },
  ];
}

/** Matches as a list: chokepoints, oil terminals, refineries (largest first), corridor pipelines, the rest, then LNG terminals. */
export function filterRows(matches: FilterMatches, data: Datasets): FilterRow[] {
  const chokepoints = data.chokepoints
    .filter((c) => matches.chokepoints.has(c.id))
    .map((c) => ({ selection: { kind: 'chokepoint' as const, id: c.id }, name: c.name, curated: true, basis: 'measured' as const }));
  const pipelines = data.pipelines
    .filter((p) => matches.pipelines.has(p.id))
    .map((p) => ({ selection: { kind: 'pipeline' as const, id: p.id }, name: p.name, curated: p.sources.includes('curated'), basis: statusBasis(p.evidence[0]) }))
    .sort((a, b) => Number(b.curated) - Number(a.curated) || a.name.localeCompare(b.name));
  const terminals = data.lngTerminals
    .filter((t) => matches.lng.has(t.id))
    .map((t) => ({ selection: { kind: 'lng' as const, id: t.id }, name: t.name, curated: false, basis: statusBasis(t.evidence[0]) }));
  const oilTerminals = data.oilTerminals
    .filter((t) => matches.terminals.has(t.id))
    .map((t) => ({ selection: { kind: 'terminal' as const, id: t.id }, name: t.name, curated: true, basis: statusBasis(t.evidence[0]) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const refineries = data.refineries
    .filter((r) => matches.refineries.has(r.id))
    .map((r) => ({ selection: { kind: 'refinery' as const, id: r.id }, name: r.name, curated: true, basis: statusBasis(r.evidence[0]) }));
  return [...chokepoints.sort((a, b) => a.name.localeCompare(b.name)), ...oilTerminals, ...refineries, ...pipelines, ...terminals];
}
