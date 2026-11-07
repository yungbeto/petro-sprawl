// Shale plays (SPEC M12): EIA's play outlines to ShalePlay records, and STEO's monthly series to ShaleSeries,
// history only. Pure, so the import and the fetch are thin.

import type { MultiPolygon, Polygon } from 'geojson';
import { SHALE } from '../../src/lib/config';
import type { ShalePlay, ShaleSeries } from '../../src/types';

/** The shapefile's fields (ShalePlays_US_EIA_Dec2021.dbf), with the label point mapshaper adds. */
export interface EiaPlayProps {
  ID: string;
  Shale_play: string;
  Basin: string;
  Lithology: string;
  Age_shale: string;
  Area_sq_km: number;
  References: string;
  lx: number;
  ly: number;
  /** The USGS province code the play overlaps most, from the join; null when none overlaps enough. */
  CODE?: number | null;
}

const FORMATION_BY_PLAY = new Map<string, string>(SHALE.formations.flatMap((f) => f.plays.map((p) => [p, f.id] as const)));

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
/** EIA's text fields have doubled spaces and stray capitals ("MIxed Shale"). Spaces only: the words stay EIA's. */
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

export function toShalePlay(p: EiaPlayProps, geometry: Polygon | MultiPolygon): ShalePlay {
  const formation = FORMATION_BY_PLAY.get(p.ID);
  return {
    id: `eia-${p.ID.toLowerCase()}`,
    name: tidy(p.Shale_play),
    basin: tidy(p.Basin),
    ...(p.CODE != null ? { provinceId: `usgs-${p.CODE}` } : {}),
    lithology: tidy(p.Lithology),
    age: tidy(p.Age_shale),
    areaKm2: Math.round(p.Area_sq_km),
    ...(formation ? { formation } : {}),
    reference: tidy(p.References),
    labelPoint: [round(p.lx, 4), round(p.ly, 4)],
    geometry,
  };
}

/** Outline IDs named in SHALE.formations that the shapefile doesn't have: a typo in config, or EIA renamed one. */
export function missingPlays(ids: readonly string[]): string[] {
  const have = new Set(ids);
  return [...FORMATION_BY_PLAY.keys()].filter((id) => !have.has(id));
}

/** Every STEO series the fetch asks for, with its kind. */
export function shaleSeriesIds(): { id: string; kind: ShaleSeries['kind'] }[] {
  const out: { id: string; kind: ShaleSeries['kind'] }[] = [];
  for (const f of SHALE.formations) {
    if ('oil' in f) out.push({ id: f.oil, kind: 'oil' });
    if ('gas' in f) out.push({ id: f.gas, kind: 'gas' });
  }
  out.push({ id: SHALE.totals.oil, kind: 'oil' }, { id: SHALE.totals.gas, kind: 'gas' });
  for (const r of SHALE.regions) {
    for (const [kind, prefix] of Object.entries(SHALE.activity)) out.push({ id: `${prefix}${r.code}`, kind: kind as ShaleSeries['kind'] });
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Release Date: October 6, 2026" on EIA's STEO page -> "2026-10-06"; null when the page doesn't say. */
export function steoReleaseDate(text: string): string | null {
  const m = text.match(/(?<!Next )Release Date:\s*(?:<[^>]*>\s*)*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

export interface SteoRow {
  period: string;
  seriesId: string;
  seriesDescription: string;
  value: number | string | null;
  unit?: string | null;
}

/**
 * STEO rows to series, history only. STEO mixes history and forecast with no flag, so a series with any
 * month at or after its release's month is refused outright rather than cut: that would mean EIA started
 * forecasting it, and the page would need to say so. Keeps the last `months`. Throws on a series missing.
 */
export function toShaleSeries(
  rows: SteoRow[],
  wanted: { id: string; kind: ShaleSeries['kind'] }[],
  release: string,
  months: number = SHALE.months,
): ShaleSeries[] {
  const releaseMonth = release.slice(0, 7);
  return wanted.map(({ id, kind }) => {
    const mine = rows.filter((r) => r.seriesId === id);
    if (!mine.length) throw new Error(`STEO has no rows for ${id}`);
    const future = mine.filter((r) => r.period >= releaseMonth && r.value !== null && r.value !== '');
    if (future.length) throw new Error(`${id} has values from ${future[0]!.period}, at or after its release month ${releaseMonth}: a forecast`);
    const points = mine
      .flatMap((r) => {
        const value = r.value === null || r.value === '' ? NaN : Number(r.value);
        return Number.isFinite(value) ? [{ period: r.period, value }] : [];
      })
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-months);
    if (!points.length) throw new Error(`${id} has no values`);
    const first = mine[0]!;
    return { id, kind, name: tidy(first.seriesDescription), unit: first.unit ? tidy(first.unit) : null, release, points };
  });
}
