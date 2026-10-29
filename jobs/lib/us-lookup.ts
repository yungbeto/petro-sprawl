// Pure builders for the "Where is my oil from?" lookup (SPEC M6): ZIP code to state, large cities,
// a map point per PADD and a label point per country. The job is jobs/import-us-lookup.ts.

import { PADDS, type PaddId } from '../../src/lib/config';
import type { UsLookup } from '../../src/types';

/**
 * ZCTA-to-county relationship rows to [zcta, state] pairs, each ZCTA assigned to the state holding
 * most of its land. `stateByFips` maps two-digit state FIPS codes to names.
 */
export function zctaStates(text: string, stateByFips: Map<string, string>): [number, string][] {
  const [header, ...lines] = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = header!.split('|');
  const zcta = cols.indexOf('GEOID_ZCTA5_20');
  const county = cols.indexOf('GEOID_COUNTY_20');
  const land = cols.indexOf('AREALAND_PART');
  const best = new Map<number, { state: string; land: number }>();
  for (const line of lines) {
    const f = line.split('|');
    if (!f[zcta] || !f[county]) continue;
    const state = stateByFips.get(f[county]!.slice(0, 2));
    if (!state) continue;
    const id = Number(f[zcta]);
    const area = Number(f[land]) || 0;
    const current = best.get(id);
    if (!current || area > current.land) best.set(id, { state, land: area });
  }
  return [...best].map(([id, v]) => [id, v.state] as [number, string]).sort((a, b) => a[0] - b[0]);
}

/**
 * Runs of ZCTAs in the same state, as [first, last, state index]. A ZIP code that isn't a ZCTA (a PO
 * box, say) falls in a gap; `stateForZip` only places it when both neighbours agree.
 */
export function zipRanges(pairs: [number, string][], states: string[]): [number, number, number][] {
  const ranges: [number, number, number][] = [];
  for (const [zip, state] of pairs) {
    const index = states.indexOf(state);
    const last = ranges.at(-1);
    if (last && last[2] === index) last[1] = zip;
    else ranges.push([zip, zip, index]);
  }
  return ranges;
}

/**
 * "Houston city" -> "Houston"; "Nashville-Davidson metropolitan government (balance)" ->
 * "Nashville-Davidson"; "Louisville/Jefferson County metro government (balance)" -> "Louisville";
 * "Urban Honolulu" -> "Honolulu".
 */
export function placeName(name: string): string {
  return name
    .replace(/\s*\(balance\)$/, '')
    .replace(/\s+(city|town|village|municipality|borough|CDP|urban county|metro government|metropolitan government|unified government|consolidated government)$/i, '')
    .replace(/\/.*$/, '')
    .replace(/^Urban /, '')
    .trim();
}

/** The `count` most populous incorporated places (SUMLEV 162) from the Census population estimates CSV. */
export function largestCities(csv: string, count: number, popColumn: string): UsLookup['cities'] {
  const [header, ...lines] = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = header!.split(',');
  const at = (name: string) => cols.indexOf(name);
  const [sumlev, name, stname, pop] = [at('SUMLEV'), at('NAME'), at('STNAME'), at(popColumn)];
  if ([sumlev, name, stname, pop].some((i) => i < 0)) throw new Error(`population file is missing a column (${popColumn}?)`);
  return lines
    .map((l) => l.split(','))
    // A quoted name with a comma would shift the columns; no incorporated place has one, so skip any that do.
    .filter((f) => f.length === cols.length && f[sumlev] === '162')
    .map((f) => ({ name: placeName(f[name]!), state: f[stname]!, population: Number(f[pop]) }))
    .sort((a, b) => b.population - a.population)
    .slice(0, count)
    .map(({ name: n, state }) => ({ name: n, state }));
}

/**
 * One map point per PADD: the capacity-weighted centre of its refineries in the lower 48 (Alaska and
 * Hawaii would pull the West Coast's point out to sea). A schematic end for route arcs, not a place.
 */
export function paddHubs(
  refineries: { padd: number; state: string; capacity: number; lon: number; lat: number }[],
): Record<PaddId, [number, number]> {
  const hubs = {} as Record<PaddId, [number, number]>;
  PADDS.forEach((padd, i) => {
    const mine = refineries.filter((r) => r.padd === i + 1 && r.capacity > 0 && r.state !== 'Alaska' && r.state !== 'Hawaii');
    const total = mine.reduce((a, r) => a + r.capacity, 0);
    if (!total) throw new Error(`no refineries with capacity in ${padd.name}`);
    const round = (v: number) => Math.round(v * 1000) / 1000;
    hubs[padd.id] = [
      round(mine.reduce((a, r) => a + r.lon * r.capacity, 0) / total),
      round(mine.reduce((a, r) => a + r.lat * r.capacity, 0) / total),
    ];
  });
  return hubs;
}
