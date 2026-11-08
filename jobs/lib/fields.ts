// Oil and gas fields (SPEC M13): GEM's Global Oil and Gas Extraction Tracker rows (jobs/import-fields.py) to
// one record per place. A GEM project holding field rows becomes one record with them as its parts; every other
// field stands alone. Points, statuses and figures are GEM's, never typed in or summed.

import { FIELDS } from '../../src/lib/config';
import type { AssetStatus, Evidence, Field, FieldOutput } from '../../src/types';
import { countryToIso } from './countries';
import { byRankThenObservedDesc } from './curated-pipelines';
import { parseOwners } from './gem';

type Row = Record<string, string | undefined>;

export interface GogetRows {
  source: string;
  sha256: string;
  fields: Row[];
  fieldOutput: Row[];
  projects: Row[];
  projectOutput: Row[];
}

export interface FieldImport {
  fields: Field[];
  /** Why rows were left out, counted. */
  skipped: Record<string, number>;
  /** Rows GEM gives no point for: off the map, never placed by hand. */
  unplaced: string[];
  unresolvedCountries: string[];
  /** Two figures for one fuel and year; the first is kept. */
  duplicateFigures: string[];
}

/** GEM's extraction statuses to ours; GEM's own word stays in the evidence statement. */
const STATUS: Record<string, AssetStatus> = {
  operating: 'operating',
  'in-development': 'under_construction',
  'in development': 'under_construction',
  mothballed: 'idle',
  decommissioning: 'offline',
  decommissioned: 'offline',
  abandoned: 'offline',
};

export function mapGogetStatus(raw: string | undefined): AssetStatus {
  return STATUS[(raw ?? '').trim().toLowerCase()] ?? 'unknown';
}

/** "Kashagan Oil and Gas Field (Kazakhstan)" -> "Kashagan Oil and Gas Field". */
export function fieldName(raw: string): string {
  return raw.replace(/\s*\([^()]*\)\s*$/, '').trim() || raw.trim();
}

/** GEM writes years as "2023.0". */
export function parseYear(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1800 ? n : undefined;
}

const FUELS = new Set<Field['fuel']>(['oil', 'gas', 'oil and gas', 'gas and condensate']);
const UNITS = new Set(['million bbl/y', 'million m³/y']);
const round = (n: number) => Math.round(n * 1e4) / 1e4;
const gemId = (raw: string) => `gem-${raw.trim().toLowerCase()}`;
const words = (raw: string | undefined) => (raw ?? '').trim();

/** Newest year per fuel for each field row, as GEM gives it. */
export function fieldOutputs(rows: Row[], duplicates: string[] = []): Map<string, FieldOutput[]> {
  const byUnit = new Map<string, Map<string, FieldOutput>>();
  for (const row of rows) {
    const value = Number(row['Quantity (converted)']);
    const unit = words(row['Units (converted)']);
    const fuel = words(row['Fuel description']);
    const year = parseYear(row['Data Year']);
    if (!fuel || !UNITS.has(unit) || !Number.isFinite(value) || value < 0) continue;
    const id = words(row['Unit ID']);
    const fuels = byUnit.get(id) ?? new Map<string, FieldOutput>();
    byUnit.set(id, fuels);
    const held = fuels.get(fuel);
    if (held && (held.year ?? 0) === (year ?? 0)) {
      duplicates.push(`${id} ${fuel} ${year ?? 'no year'}`);
      continue;
    }
    if (held && (held.year ?? 0) > (year ?? 0)) continue;
    fuels.set(fuel, { fuel, value: round(value), unit, ...(year ? { year } : {}) });
  }
  return new Map([...byUnit].map(([id, fuels]) => [id, [...fuels.values()]]));
}

/** GEM's project-level figures: no year in the sheet; some are GEM's own sum of the project's fields. */
export function projectOutputs(rows: Row[]): Map<string, FieldOutput[]> {
  const byProject = new Map<string, FieldOutput[]>();
  for (const row of rows) {
    const value = Number(row['Quantity (converted)']);
    const unit = words(row['Units (converted)']);
    const fuel = words(row['Fuel description']);
    if (!fuel || !UNITS.has(unit) || !Number.isFinite(value) || value < 0) continue;
    const id = words(row['Project ID']);
    const summed = /summed/i.test(words(row['Data source type']));
    byProject.set(id, [...(byProject.get(id) ?? []), { fuel, value: round(value), unit, ...(summed ? { summedByGem: true as const } : {}) }]);
  }
  return byProject;
}

interface Common {
  id: string;
  name: string;
  row: Row;
  url: string | undefined;
}

export function toFields(input: GogetRows, ctx: { recordedAt: string }): FieldImport {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const unplaced: string[] = [];
  const unresolved = new Set<string>();
  const duplicateFigures: string[] = [];
  const excluded = new Set<string>(FIELDS.excludedStatuses);
  const isExcluded = (row: Row) => excluded.has(words(row.Status).toLowerCase());

  const fieldRows = new Map(input.fields.map((r) => [words(r['Unit ID']), r]));
  const fieldOut = fieldOutputs(input.fieldOutput, duplicateFigures);
  const projectOut = projectOutputs(input.projectOutput);

  const build = ({ id, name, row, url }: Common, level: Field['level'], output: FieldOutput[], parts?: Field['parts']): Field | null => {
    if (isExcluded(row)) {
      skip(`status ${words(row.Status).toLowerCase()}`);
      return null;
    }
    const fuel = words(row['Fuel type']).toLowerCase() as Field['fuel'];
    if (!FUELS.has(fuel)) {
      skip(`fuel "${words(row['Fuel type']) || 'none'}"`);
      return null;
    }
    if (!url) {
      skip('no GEM page');
      return null;
    }
    const lat = Number(row.Latitude);
    const lon = Number(row.Longitude);
    if (!row.Latitude || !row.Longitude || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      unplaced.push(`${name} (${words(row['Country/Area'])}, ${level} ${id})`);
      return null;
    }
    // A unit across a border lists both countries; the first is kept.
    const countryName = words(row['Country/Area']).split(/[;,]/)[0]!.trim();
    const country = countryToIso(countryName);
    if (!country) {
      unresolved.add(countryName || '(none given)');
      return null;
    }
    const raw = words(row.Status);
    const status = mapGogetStatus(raw);
    const statusYear = parseYear(row['Status year']);
    const evidence: Evidence = {
      status,
      sourceType: 'dataset',
      statement: raw
        ? `Global Energy Monitor lists it as ${raw.toLowerCase()}${statusYear ? `, from a source dated ${statusYear}` : ''}.`
        : 'Global Energy Monitor gives no status.',
      url,
      observedAt: FIELDS.release,
      recordedAt: ctx.recordedAt,
    };
    const location = words(row['Onshore/Offshore']).toLowerCase();
    const production = words(row['Production Type']).toLowerCase();
    const owners = parseOwners(row['Owner(s)']);
    const discovered = parseYear(row['Discovery year']);
    const startYear = parseYear(row['Production start year']);
    return {
      id: gemId(id),
      name,
      aliases: words(row['Name Other']).split(/[;,]/).map((n) => n.trim()).filter((n) => n && n !== name),
      level,
      ...(parts?.length ? { parts } : {}),
      country,
      ...(words(row['Subnational unit']) ? { subnational: words(row['Subnational unit']) } : {}),
      point: [round(lon), round(lat)],
      pointApprox: words(row['Location accuracy']).toLowerCase() !== 'exact',
      fuel,
      location: location === 'onshore' || location === 'offshore' ? location : 'unknown',
      ...(production === 'conventional' || production === 'unconventional' ? { production } : {}),
      ...(words(row.Operator) ? { operator: words(row.Operator) } : {}),
      ...(owners.length ? { owners } : {}),
      ...(discovered ? { discovered } : {}),
      ...(startYear ? { startYear } : {}),
      output,
      gemUrl: url,
      evidence: [evidence],
    };
  };

  const records: Field[] = [];
  const grouped = new Set<string>();
  for (const row of input.projects) {
    const id = words(row['Project ID']);
    const partIds = words(row['Units (list of IDs)']).split(',').map((u) => u.trim()).filter((u) => fieldRows.has(u));
    const parts = partIds.map((u) => {
      const part = fieldRows.get(u)!;
      return {
        id: gemId(u),
        name: fieldName(words(part['Unit Name'])),
        ...(words(part.Status) ? { status: words(part.Status).toLowerCase() } : {}),
        output: fieldOut.get(u) ?? [],
      };
    });
    const record = build({ id, name: fieldName(words(row['Project Name'])), row, url: words(row['Wiki URL (project)']) || undefined }, 'project', projectOut.get(id) ?? [], parts);
    if (!record) continue;
    records.push(record);
    // The project stands for its fields only once it's on the map; otherwise they stand alone.
    partIds.forEach((u) => grouped.add(u));
  }
  for (const [id, row] of fieldRows) {
    if (grouped.has(id)) continue;
    const record = build({ id, name: fieldName(words(row['Unit Name'])), row, url: words(row['Wiki URL (field)']) || undefined }, 'field', fieldOut.get(id) ?? []);
    if (record) records.push(record);
  }
  const ids = new Set<string>();
  const unique = records.filter((r) => (ids.has(r.id) ? (skip('id listed twice'), false) : (ids.add(r.id), true)));
  unique.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { fields: unique, skipped, unplaced: unplaced.sort(), unresolvedCountries: [...unresolved].sort(), duplicateFigures };
}

/**
 * Adds each record's claims to its field, ranked like pipeline evidence (cited claims before GEM's listing, then
 * newest). Throws on an id that isn't there, so a renamed field can't drop its claims.
 */
export function mergeFieldEvidence(curated: readonly { id: string; evidence: Evidence[] }[], fields: readonly Field[]): Field[] {
  const byId = new Map(curated.map((c) => [c.id, c.evidence]));
  const known = new Set(fields.map((f) => f.id));
  const missing = [...byId.keys()].filter((id) => !known.has(id));
  if (missing.length) throw new Error(`curated field evidence points at fields that don't exist: ${missing.join(', ')}`);
  return fields.map((f) => {
    const cited = byId.get(f.id);
    return cited ? { ...f, evidence: [...cited, ...f.evidence].sort(byRankThenObservedDesc) } : f;
  });
}
