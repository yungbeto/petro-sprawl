// Pure transform from GEM Global Gas Infrastructure Tracker LNG terminal rows (one per unit) to terminals.

import type { AssetStatus, Evidence, LngTerminal, LngUnit } from '../../src/types';
import { countryToIso } from './countries';
import { EXCLUDED_STATUSES, mapGemStatus, parseOwners } from './gem';

/** The GEM fields the import reads. */
export interface GemLngRow {
  ProjectID: string;
  TerminalName: string;
  UnitName: string | null;
  FacilityType: string;
  Status: string;
  OtherNames: string | null;
  'Country/Area': string | null;
  Owner: string | null;
  Operator: string | null;
  CapacityinMtpa: number | null;
  ActualStartYear: number | null;
  LatestPlannedStartYear: number | null;
  Latitude: number;
  Longitude: number;
  Accuracy: string | null;
  Offshore: string | null;
  Floating: string | null;
  Wiki: string | null;
  LastUpdated: string | null;
}

export interface LngImportContext {
  recordedAt: string;
  /** Tracker release month (YYYY-MM), used when no unit has a LastUpdated date. */
  releaseDate: string;
}

/** A terminal is as live as its most live unit. */
const STATUS_RANK: AssetStatus[] = ['operating', 'reduced', 'under_construction', 'planned', 'idle', 'offline', 'unknown'];

const STATUS_WORDS: Partial<Record<AssetStatus, string>> = {
  operating: 'operating',
  under_construction: 'under construction',
  planned: 'proposed',
  idle: 'idle or mothballed',
  offline: 'retired',
  unknown: 'of unknown status',
};

const round = (n: number) => Math.round(n * 100) / 100;

/** "3 units operating, 1 under construction". */
export function unitSummary(units: LngUnit[]): string {
  const counts = new Map<AssetStatus, number>();
  for (const u of units) counts.set(u.status, (counts.get(u.status) ?? 0) + 1);
  const parts = STATUS_RANK.filter((s) => counts.has(s)).map((s) => `${counts.get(s)} ${STATUS_WORDS[s] ?? s}`);
  const first = parts[0]?.replace(/^(\d+) /, (_, n: string) => `${n} ${n === '1' ? 'unit' : 'units'} `);
  return [first, ...parts.slice(1)].join(', ');
}

export interface LngImport {
  terminals: LngTerminal[];
  skipped: Record<string, number>;
  unresolvedCountries: string[];
}

/** Groups unit rows by GEM project and facility type; cancelled and shelved units are left out. */
export function lngTerminals(rows: GemLngRow[], ctx: LngImportContext): LngImport {
  const skipped: Record<string, number> = {};
  const unresolved = new Set<string>();
  const groups = new Map<string, GemLngRow[]>();
  for (const row of rows) {
    const status = row.Status.trim().toLowerCase();
    if (EXCLUDED_STATUSES.has(status)) {
      skipped.excluded_status = (skipped.excluded_status ?? 0) + 1;
      continue;
    }
    const facility = row.FacilityType.trim().toLowerCase();
    if (facility !== 'export' && facility !== 'import') {
      skipped.unknown_facility = (skipped.unknown_facility ?? 0) + 1;
      continue;
    }
    const key = `${row.ProjectID.trim().toLowerCase()}-${facility}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const terminals = [...groups].map(([key, group]): LngTerminal => {
    const units: LngUnit[] = group.map((row) => {
      const start = row.ActualStartYear ?? row.LatestPlannedStartYear;
      return {
        ...(row.UnitName?.trim() ? { name: row.UnitName.trim() } : {}),
        status: mapGemStatus(row.Status),
        ...(row.CapacityinMtpa && row.CapacityinMtpa > 0 ? { capacityMtpa: row.CapacityinMtpa } : {}),
        ...(start ? { startYear: start } : {}),
      };
    });
    const status = STATUS_RANK.find((s) => units.some((u) => u.status === s)) ?? 'unknown';
    // The first operating unit marks the terminal; units of one project can sit a little apart.
    const anchor = group[units.findIndex((u) => u.status === status)] ?? group[0]!;
    const first = group[0]!;
    const sum = (keep: (u: LngUnit) => boolean) =>
      round(units.filter(keep).reduce((total, u) => total + (u.capacityMtpa ?? 0), 0));
    const dates = group.map((r) => r.LastUpdated?.trim() ?? '').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const countryName = first['Country/Area']?.trim() ?? '';
    const country = countryName ? countryToIso(countryName) : null;
    if (!country) unresolved.add(countryName || '(none given)');
    const owners = parseOwners(first.Owner ?? undefined);
    const evidence: Evidence = {
      status,
      sourceType: 'dataset',
      statement: `Global Energy Monitor: ${unitSummary(units)}`,
      ...(first.Wiki?.trim() ? { url: first.Wiki.trim() } : {}),
      observedAt: dates.at(-1) ?? ctx.releaseDate,
      recordedAt: ctx.recordedAt,
    };
    return {
      id: `gem-${key}`,
      name: first.TerminalName.trim(),
      aliases: (first.OtherNames ?? '').split(/[;,]/).map((n) => n.trim()).filter(Boolean),
      facility: key.endsWith('-export') ? 'export' : 'import',
      country: country ?? '',
      point: [anchor.Longitude, anchor.Latitude],
      pointApprox: anchor.Accuracy?.trim().toLowerCase() !== 'exact',
      floating: group.some((r) => r.Floating === 'True'),
      offshore: group.some((r) => r.Offshore === 'True'),
      ...(first.Operator?.trim() ? { operator: first.Operator.trim() } : {}),
      ...(owners.length ? { owners } : {}),
      capacityMtpa: {
        operating: sum((u) => u.status === 'operating' || u.status === 'reduced'),
        planned: sum((u) => u.status === 'under_construction' || u.status === 'planned'),
      },
      units,
      evidence: [evidence],
    };
  });
  terminals.sort((a, b) => a.name.localeCompare(b.name) || a.facility.localeCompare(b.facility));
  return { terminals, skipped, unresolvedCountries: [...unresolved].sort() };
}
