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

/** USGS province record to Basin. Returns null for province types we don't show. */
export function toBasin(props: UsgsProvinceProps, geometry: Polygon | MultiPolygon): Basin | null {
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
    geometry,
  };
}
