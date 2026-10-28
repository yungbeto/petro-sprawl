import type { MultiPolygon, Polygon } from 'geojson';
import type { Basin } from '../../src/types';

export interface UsgsProvinceProps {
  CODE: number;
  NAME: string;
  TYPE: string;
  O_G: string;
  lx: number;
  ly: number;
}

const ROUND = 1e4;
const round = (n: number) => Math.round(n * ROUND) / ROUND;

/** Natural Earth marks countries without an ISO code (Somaliland, Northern Cyprus) as -99. */
const isIsoCode = (code: string) => /^[A-Z]{2}$/.test(code);

export interface BasinCountryMatch {
  code: number;
  /** Natural Earth ISO_A2_EH */
  iso: string;
  name: string;
}

/**
 * Basin code -> sorted ISO codes from overlap matches (duplicates allowed, from either join).
 * Countries without an ISO code are left out and returned by name for the import report.
 */
export function mergeBasinCountries(matches: BasinCountryMatch[]): { countries: Map<number, string[]>; skipped: string[] } {
  const sets = new Map<number, Set<string>>();
  const skipped = new Set<string>();
  for (const { code, iso, name } of matches) {
    if (!isIsoCode(iso)) {
      skipped.add(name);
      continue;
    }
    if (!sets.has(code)) sets.set(code, new Set());
    sets.get(code)!.add(iso);
  }
  const countries = new Map([...sets].map(([code, set]) => [code, [...set].sort()]));
  return { countries, skipped: [...skipped].sort() };
}

/** USGS province record to Basin. Returns null for province types we don't show. */
export function toBasin(
  props: UsgsProvinceProps,
  geometry: Polygon | MultiPolygon,
  countries: string[] = [],
): Basin | null {
  const provinceType = props.TYPE === 'p' ? 'priority' : props.TYPE === 'b' ? 'boutique' : null;
  if (!provinceType) return null;
  const og = props.O_G.trim().toLowerCase();
  return {
    id: `usgs-${props.CODE}`,
    code: props.CODE,
    name: props.NAME.trim(),
    provinceType,
    dominant: og === 'oil' || og === 'gas' ? og : null,
    labelPoint: [round(props.lx), round(props.ly)],
    countries,
    geometry,
  };
}
