import { z } from 'zod';
import { EIA, PADDS, type PaddId } from '../../src/lib/config';
import type { CrudeMonth, OilOriginRegion } from '../../src/types';

/** One row of an EIA API v2 `data` response. Values come as strings or numbers, or null when withheld. */
export const eiaRowSchema = z.object({
  period: z.string(),
  duoarea: z.string(),
  'area-name': z.string().nullable(),
  'series-description': z.string(),
  units: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
});
export type EiaRow = z.infer<typeof eiaRowSchema>;

export const eiaResponseSchema = z.object({
  response: z.object({ total: z.union([z.number(), z.string()]), data: z.array(eiaRowSchema) }),
});

const PADD_BY_EIA = new Map<string, PaddId>(PADDS.map((p) => [p.eia, p.id]));
const PADD_BY_STATE = new Map<string, PaddId>(PADDS.flatMap((p) => p.states.map((s) => [s.toLowerCase(), p.id] as const)));

/** Thousand-barrel monthly rows only, with a number. Withheld values are left out, not read as zero. */
function volumes(rows: EiaRow[]): (EiaRow & { kbbl: number })[] {
  return rows.flatMap((r) => {
    const kbbl = r.value === null || r.value === '' ? NaN : Number(r.value);
    return r.units === 'MBBL' && Number.isFinite(kbbl) ? [{ ...r, kbbl }] : [];
  });
}

type ByPeriod<T> = Map<PaddId, Map<string, T>>;

function put<T>(map: ByPeriod<T>, padd: PaddId, period: string, init: () => T): T {
  const periods = map.get(padd) ?? new Map<string, T>();
  map.set(padd, periods);
  const value = periods.get(period) ?? init();
  periods.set(period, value);
  return value;
}

/**
 * Crude imports by PADD of processing (`move/impcp`, process IP0), by country. Group rows (OPEC,
 * Persian Gulf and the like) are dropped; each PADD-month's countries must add up to its total.
 */
export function importsByPadd(rows: EiaRow[]): ByPeriod<CrudeMonth['imports']> {
  const out: ByPeriod<CrudeMonth['imports']> = new Map();
  const totals = new Map<string, number>();
  for (const r of volumes(rows)) {
    const [area, partner] = r.duoarea.split('-');
    const padd = PADD_BY_EIA.get(area ?? '');
    if (!padd || !partner) continue;
    if (partner === 'Z00') {
      // A month with a total but no countries (no imports at all) still counts as reported.
      totals.set(`${padd} ${r.period}`, r.kbbl);
      put(out, padd, r.period, () => []);
      continue;
    }
    const name = r['series-description'].match(/ from (.+?) of Crude Oil/)?.[1];
    if (!/^[A-Z]{3}$/.test(r['area-name'] ?? '') || !name || r.kbbl === 0) continue;
    put(out, padd, r.period, () => []).push({ code: r['area-name']!, name, kbbl: r.kbbl });
  }
  for (const [padd, periods] of out) {
    for (const [period, list] of periods) {
      const total = totals.get(`${padd} ${period}`);
      const sum = list.reduce((a, c) => a + c.kbbl, 0);
      if (total === undefined || Math.abs(sum - total) > Math.max(5, total * 0.02)) {
        throw new Error(`${padd} ${period}: countries add up to ${sum}, EIA total is ${total ?? 'missing'}`);
      }
      list.sort((a, b) => b.kbbl - a.kbbl);
    }
  }
  return out;
}

/** Crude received from other PADDs (`move/ptb`), with the pipeline, tanker and barge, and rail splits. */
export function receiptsByPadd(
  rows: { total: EiaRow[]; pipeline: EiaRow[]; tankerBarge: EiaRow[]; rail: EiaRow[] },
): ByPeriod<CrudeMonth['receipts']> {
  const key = (r: EiaRow) => `${r.duoarea} ${r.period}`;
  const mode = (list: EiaRow[]) => new Map(volumes(list).map((r) => [key(r), r.kbbl]));
  const pipeline = mode(rows.pipeline);
  const tankerBarge = mode(rows.tankerBarge);
  const rail = mode(rows.rail);
  const out: ByPeriod<CrudeMonth['receipts']> = new Map();
  for (const r of volumes(rows.total)) {
    const [to, from] = r.duoarea.split('-').map((a) => PADD_BY_EIA.get(a));
    if (!to || !from || r.kbbl === 0) continue;
    put(out, to, r.period, () => []).push({
      from,
      kbbl: r.kbbl,
      pipeline: pipeline.get(key(r)) ?? 0,
      tankerBarge: tankerBarge.get(key(r)) ?? 0,
      rail: rail.get(key(r)) ?? 0,
    });
  }
  for (const periods of out.values()) for (const list of periods.values()) list.sort((a, b) => b.kbbl - a.kbbl);
  return out;
}

/** Refinery and blender net input of crude (`pnp/inpt`) by PADD. */
export function refineryInputByPadd(rows: EiaRow[]): ByPeriod<number> {
  const out: ByPeriod<number> = new Map();
  for (const r of volumes(rows)) {
    const padd = PADD_BY_EIA.get(r.duoarea);
    if (padd) put(out, padd, r.period, () => r.kbbl);
  }
  return out;
}

/** "Federal Offshore--Gulf of America" -> "Federal offshore, Gulf of America"; "Texas" stays. */
export function areaName(description: string): string {
  const name = description.replace(/ Field Production of Crude Oil.*$/, '').trim();
  return name.replace(/^Federal Offshore/, 'Federal offshore').replace(/\s*--\s*/g, ', ');
}

/** Field production of crude (`crd/crpdn`) by state and federal offshore area, grouped by PADD. */
export function productionByPadd(rows: EiaRow[]): ByPeriod<CrudeMonth['production']> {
  const out: ByPeriod<CrudeMonth['production']> = new Map();
  for (const r of volumes(rows)) {
    const area = areaName(r['series-description']);
    const padd = r.duoarea.startsWith('S') ? PADD_BY_STATE.get(area.toLowerCase()) : EIA.offshore[r.duoarea];
    if (!padd || r.kbbl === 0) continue;
    put(out, padd, r.period, () => []).push({ area, kbbl: r.kbbl });
  }
  for (const periods of out.values()) for (const list of periods.values()) list.sort((a, b) => b.kbbl - a.kbbl);
  return out;
}

/**
 * One record per PADD, with the months where refinery input, imports and inter-PADD receipts are all
 * reported (production can lag a month and may be empty). Newest month last, at most `months`.
 */
export function toRegions(
  parts: {
    imports: ByPeriod<CrudeMonth['imports']>;
    receipts: ByPeriod<CrudeMonth['receipts']>;
    input: ByPeriod<number>;
    production: ByPeriod<CrudeMonth['production']>;
  },
  { months, capacity }: { months: number; capacity?: Map<PaddId, OilOriginRegion['capacity']> },
): OilOriginRegion[] {
  // A month counts once every PADD has imports and refinery input, and some PADD has receipts.
  const reported = (map: ByPeriod<unknown>) => new Set([...map.values()].flatMap((m) => [...m.keys()]));
  const receiptMonths = reported(parts.receipts);
  const complete = [...reported(parts.input)]
    .filter((p) => receiptMonths.has(p) && PADDS.every((padd) => parts.input.get(padd.id)?.has(p) && parts.imports.get(padd.id)?.has(p)))
    .sort()
    .slice(-months);
  return PADDS.map((padd) => {
    const region: OilOriginRegion = {
      id: padd.id,
      name: padd.name,
      months: complete.map((period) => ({
        period,
        refineryInput: parts.input.get(padd.id)!.get(period)!,
        imports: parts.imports.get(padd.id)?.get(period) ?? [],
        receipts: parts.receipts.get(padd.id)?.get(period) ?? [],
        production: parts.production.get(padd.id)?.get(period) ?? [],
      })),
    };
    const cap = capacity?.get(padd.id);
    return cap ? { ...region, capacity: cap } : region;
  });
}
