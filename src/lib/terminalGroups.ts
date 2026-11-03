// The terminals surface: LNG and oil terminals, each grouped a few ways. Pure.

import { lngStatus, terminalStatus } from './encoding';
import { regionLabel } from './pipelineGroups';
import { STATUS_GROUPS, countStatuses, statusGroups, type StatusGroupId } from './summary';
import type { AssetStatus, Chokepoint, CountryRegion, LngTerminal, OilTerminal } from '../types';

export const TERMINAL_KINDS = ['lng', 'oil'] as const;
export type TerminalKind = (typeof TERMINAL_KINDS)[number];

export const TERMINAL_KIND_LABELS: Record<TerminalKind, string> = { lng: 'LNG', oil: 'Oil' };

export type TerminalGrouping = 'facility' | 'route' | 'region' | 'status';

/** LNG terminals split by what they do; oil terminals by the straits their tankers pass. */
export const TERMINAL_GROUPINGS: Record<TerminalKind, readonly TerminalGrouping[]> = {
  lng: ['facility', 'region', 'status'],
  oil: ['route', 'region', 'status'],
};

export const TERMINAL_GROUPING_LABELS: Record<TerminalGrouping, string> = {
  facility: 'Facility',
  route: 'Route',
  region: 'Region',
  status: 'Status',
};

/** What each grouping groups by, shown under the switch; status rests on different evidence for each kind. */
export const TERMINAL_GROUPING_NOTES: Record<TerminalKind, Partial<Record<TerminalGrouping, string>>> = {
  lng: {
    facility: 'Export terminals liquefy gas for tankers; import terminals turn it back into gas.',
    region: 'By the country the terminal is in.',
    status: "By the status on the map: measured send-out or a cited claim where there is one, otherwise Global Energy Monitor's.",
  },
  oil: {
    route: 'By the chokepoints a tanker leaving the terminal has to pass.',
    region: 'By the country the terminal is in.',
    status: 'By the newest cited claim; without one the status stays unknown.',
  },
};

export interface TerminalGroup<T> {
  id: string;
  label: string;
  terminals: T[];
  status: { id: StatusGroupId; label: string; count: number }[];
}

/** Researched: measured send-out, or a claim beyond GEM's dataset status. */
export const isResearchedLng = (t: LngTerminal) => Boolean(t.sendOutSeriesId) || t.evidence.some((e) => e.sourceType !== 'dataset');

function statusGroupOf(status: AssetStatus) {
  return STATUS_GROUPS.find((g) => (g.statuses as readonly string[]).includes(status))!;
}

function bucket<T>(items: T[], key: (t: T) => { id: string; label: string }) {
  const buckets = new Map<string, { id: string; label: string; terminals: T[] }>();
  for (const t of items) {
    const { id, label } = key(t);
    const b = buckets.get(id) ?? { id, label, terminals: [] };
    b.terminals.push(t);
    buckets.set(id, b);
  }
  return [...buckets.values()];
}

/** Largest first, with the unknown group last. */
const bySize = <T>(a: { id: string; terminals: T[] }, b: { id: string; terminals: T[] }) =>
  Number(a.id === 'unknown') - Number(b.id === 'unknown') || b.terminals.length - a.terminals.length;

const byStatusOrder = (a: { id: string }, b: { id: string }) =>
  STATUS_GROUPS.findIndex((g) => g.id === a.id) - STATUS_GROUPS.findIndex((g) => g.id === b.id);

function regionKey(country: string, regionOf: Map<string, string>) {
  const region = regionOf.get(country);
  return region ? { id: region, label: regionLabel(region) } : { id: 'unknown', label: 'Region unknown' };
}

/**
 * LNG terminals in groups: by facility (export before import), by the region of their country, or by
 * status. Within a group, researched terminals come first, then by capacity in operation, then planned.
 */
export function lngGroups(terminals: LngTerminal[], by: TerminalGrouping, regions: CountryRegion[]): TerminalGroup<LngTerminal>[] {
  const regionOf = new Map(regions.map((r) => [r.id, r.region]));
  const entries = bucket(terminals, (t) => {
    if (by === 'facility') return t.facility === 'export' ? { id: 'export', label: 'Export (liquefaction)' } : { id: 'import', label: 'Import (regasification)' };
    if (by === 'status') return statusGroupOf(lngStatus(t));
    return regionKey(t.country, regionOf);
  });
  entries.sort(by === 'facility' ? (a, b) => (a.id === 'export' ? -1 : b.id === 'export' ? 1 : 0) : by === 'status' ? byStatusOrder : bySize);
  return entries.map((e) => ({
    ...e,
    terminals: [...e.terminals].sort(
      (a, b) =>
        Number(isResearchedLng(b)) - Number(isResearchedLng(a)) ||
        b.capacityMtpa.operating - a.capacityMtpa.operating ||
        b.capacityMtpa.planned - a.capacityMtpa.planned ||
        a.name.localeCompare(b.name),
    ),
    status: statusGroups(countStatuses(e.terminals.map(lngStatus))),
  }));
}

/**
 * Oil terminals in groups: by route (the straits a tanker leaving has to pass, the busiest route first,
 * open sea last), by region, or by status. Within a group, by name.
 */
export function oilGroups(
  terminals: OilTerminal[],
  by: TerminalGrouping,
  regions: CountryRegion[],
  chokepoints: Chokepoint[],
): TerminalGroup<OilTerminal>[] {
  const regionOf = new Map(regions.map((r) => [r.id, r.region]));
  const nameOf = new Map(chokepoints.map((c) => [c.id, c.name]));
  const entries = bucket(terminals, (t) => {
    if (by === 'route') {
      if (!t.exitVia.length) return { id: 'unknown', label: 'Open sea, no chokepoint' };
      const names = t.exitVia.map((id) => nameOf.get(id) ?? id);
      return { id: [...t.exitVia].sort().join('+'), label: `Through ${names.join(' or ')}` };
    }
    if (by === 'status') return statusGroupOf(terminalStatus(t));
    return regionKey(t.country, regionOf);
  });
  entries.sort(by === 'status' ? byStatusOrder : bySize);
  return entries.map((e) => ({
    ...e,
    terminals: [...e.terminals].sort((a, b) => a.name.localeCompare(b.name)),
    status: statusGroups(countStatuses(e.terminals.map(terminalStatus))),
  }));
}
