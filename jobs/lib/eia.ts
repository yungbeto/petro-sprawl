import { z } from 'zod';
import { ETHANOL_PRODUCT, EIA, FUELS, PADDS, type PaddId } from '../../src/lib/config';
import type { CrudeMonth, FuelMonth, FuelOriginRegion, OilOriginRegion } from '../../src/types';

/** One row of an EIA API v2 `data` response. Values come as strings or numbers, or null when withheld. */
export const eiaRowSchema = z.object({
  period: z.string(),
  duoarea: z.string(),
  product: z.string().optional(),
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
 * "... from Democratic Republic of the Congo of Crude Oil (Thousand Barrels)" -> the country. Greedy,
 * so a name with "of" in it survives; product names don't contain " of ".
 */
export function partnerName(description: string): string | null {
  return description.match(/ from (.+) of [^()]+?(?: \(Thousand|$)/)?.[1] ?? null;
}

/**
 * Imports by PADD (`move/impcp`) for one product, by country: crude by PADD of processing (IP0), fuels
 * by PADD of entry (IM0). Group rows (OPEC, Persian Gulf and the like) are dropped. Each PADD-month's
 * countries must add up to its total; what EIA's total holds beyond the countries it names becomes one
 * `EIA.unnamedPartner` row, and countries adding up to more than the total is an error.
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
    const name = partnerName(r['series-description']);
    if (!/^[A-Z]{3}$/.test(r['area-name'] ?? '') || !name || r.kbbl === 0) continue;
    put(out, padd, r.period, () => []).push({ code: r['area-name']!, name, kbbl: r.kbbl });
  }
  for (const [padd, periods] of out) {
    for (const [period, list] of periods) {
      const total = totals.get(`${padd} ${period}`);
      const sum = list.reduce((a, c) => a + c.kbbl, 0);
      if (total === undefined || sum - total > Math.max(5, total * 0.02)) {
        throw new Error(`${padd} ${period}: countries add up to ${sum}, EIA total is ${total ?? 'missing'}`);
      }
      list.sort((a, b) => b.kbbl - a.kbbl);
      if (total - sum > Math.max(5, total * 0.02)) {
        list.push({ code: EIA.unnamedPartner, name: 'Countries EIA does not name', kbbl: total - sum });
      }
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

/** Refinery and blender net input of crude (`pnp/inpt`), or product supplied (`cons/psup`), by PADD. */
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

/** Rows split by EIA product code, so each product's totals are checked on their own. */
function byProduct(rows: EiaRow[]): Map<string, EiaRow[]> {
  const out = new Map<string, EiaRow[]>();
  for (const r of rows) out.set(r.product ?? '', [...(out.get(r.product ?? '') ?? []), r]);
  return out;
}

/** Sums per-product imports or receipts into one list per PADD-month, keyed by country or source PADD. */
function merge<T extends { kbbl: number }>(maps: ByPeriod<T[]>[], key: (t: T) => string, add: (a: T, b: T) => T): ByPeriod<T[]> {
  const out: ByPeriod<T[]> = new Map();
  for (const map of maps) {
    for (const [padd, periods] of map) {
      for (const [period, list] of periods) {
        const target = put(out, padd, period, () => []);
        for (const item of list) {
          const at = target.findIndex((t) => key(t) === key(item));
          if (at < 0) target.push({ ...item });
          else target[at] = add(target[at]!, item);
        }
      }
    }
  }
  for (const periods of out.values()) for (const list of periods.values()) list.sort((a, b) => b.kbbl - a.kbbl);
  return out;
}

type Imports = CrudeMonth['imports'];
type Receipts = CrudeMonth['receipts'];

/** Imports of several products (gasoline and its blending components, say) as one list per PADD-month. */
export function importsOf(rows: EiaRow[], products: readonly string[]): ByPeriod<Imports> {
  const split = byProduct(rows);
  return merge(
    products.map((p) => importsByPadd(split.get(p) ?? [])),
    (i) => i.code,
    (a, b) => ({ ...a, kbbl: a.kbbl + b.kbbl }),
  );
}

/** Receipts of several products from other PADDs as one list per PADD-month, with the mode splits summed. */
export function receiptsOf(rows: { total: EiaRow[]; pipeline: EiaRow[]; tankerBarge: EiaRow[]; rail: EiaRow[] }, products: readonly string[]): ByPeriod<Receipts> {
  const only = (list: EiaRow[], p: string) => list.filter((r) => r.product === p);
  return merge(
    products.map((p) => receiptsByPadd({ total: only(rows.total, p), pipeline: only(rows.pipeline, p), tankerBarge: only(rows.tankerBarge, p), rail: only(rows.rail, p) })),
    (r) => r.from,
    (a, b) => ({ ...a, kbbl: a.kbbl + b.kbbl, pipeline: a.pipeline + b.pipeline, tankerBarge: a.tankerBarge + b.tankerBarge, rail: a.rail + b.rail }),
  );
}

/**
 * One record per PADD and fuel, for the months where every PADD reports what it used (product
 * supplied) and some PADD reports receipts. Imports may be empty: a region can import none of a fuel.
 * Gasoline carries fuel ethanol on the side, since ethanol is blended into it in the region.
 */
export function toFuelRegions(
  rows: { supplied: EiaRow[]; imports: EiaRow[]; receipts: { total: EiaRow[]; pipeline: EiaRow[]; tankerBarge: EiaRow[]; rail: EiaRow[] } },
  { months }: { months: number },
): FuelOriginRegion[] {
  const reported = (map: ByPeriod<unknown>) => new Set([...map.values()].flatMap((m) => [...m.keys()]));
  const ethanolImports = importsOf(rows.imports, [ETHANOL_PRODUCT]);
  const ethanolReceipts = receiptsOf(rows.receipts, [ETHANOL_PRODUCT]);
  return FUELS.flatMap((fuel) => {
    const supplied = refineryInputByPadd(rows.supplied.filter((r) => r.product === fuel.supplied));
    const imports = importsOf(rows.imports, fuel.products);
    const receipts = receiptsOf(rows.receipts, fuel.products);
    const receiptMonths = reported(receipts);
    const complete = [...reported(supplied)]
      .filter((p) => receiptMonths.has(p) && PADDS.every((padd) => supplied.get(padd.id)?.has(p)))
      .sort()
      .slice(-months);
    return PADDS.map((padd): FuelOriginRegion => ({
      id: `${padd.id}/${fuel.id}`,
      region: padd.id,
      fuel: fuel.id,
      months: complete.map((period): FuelMonth => ({
        period,
        supplied: supplied.get(padd.id)!.get(period)!,
        imports: imports.get(padd.id)?.get(period) ?? [],
        receipts: receipts.get(padd.id)?.get(period) ?? [],
        ...(fuel.id === 'gasoline'
          ? { ethanol: { receipts: ethanolReceipts.get(padd.id)?.get(period) ?? [], imports: ethanolImports.get(padd.id)?.get(period) ?? [] } }
          : {}),
      })),
    }));
  });
}
