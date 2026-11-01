import type { MultiPolygon, Polygon } from 'geojson';
import type { Basin } from '../../src/types';

export interface UsgsProvinceProps {
  CODE: number;
  NAME: string;
  TYPE: string;
  O_G: string;
  lx: number;
  ly: number;
  /** "1" when the province was assessed in 2000. */
  STUDIED?: string | null;
  /** Million barrels of oil, billion cubic feet of gas; -9999 for no data. */
  CUM_OIL?: number | null;
  REM_OIL?: number | null;
  UNDS_OIL?: number | null;
  CUM_GAS?: number | null;
  REM_GAS?: number | null;
  UNDS_GAS?: number | null;
}

/** The USGS fields toBasin reads volumes from. */
export const USGS_VOLUME_FIELDS = ['STUDIED', 'CUM_OIL', 'REM_OIL', 'UNDS_OIL', 'CUM_GAS', 'REM_GAS', 'UNDS_GAS'] as const;

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

/** A USGS volume, or null for no data (-9999) and for the negative values its metadata calls inconsistencies. */
const volume = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * Produced and remaining come from the fields in a province, so they're kept as given. Undiscovered is only
 * an estimate where the province was assessed: elsewhere USGS writes 0 for "not estimated", not "none".
 */
export function basinVolumes(props: UsgsProvinceProps): Basin['volumes'] {
  const assessed = String(props.STUDIED ?? '').trim() === '1';
  const of = (produced: number | null | undefined, remaining: number | null | undefined, undiscovered: number | null | undefined) => ({
    produced: volume(produced),
    remaining: volume(remaining),
    undiscovered: assessed ? volume(undiscovered) : null,
  });
  const oil = of(props.CUM_OIL, props.REM_OIL, props.UNDS_OIL);
  const gas = of(props.CUM_GAS, props.REM_GAS, props.UNDS_GAS);
  const any = [oil, gas].some((v) => Object.values(v).some((n) => n !== null));
  return any ? { oil, gas } : null;
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
    volumes: basinVolumes(props),
    geometry,
  };
}
