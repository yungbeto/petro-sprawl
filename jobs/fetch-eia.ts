// Scheduled: EIA supply by PADD for "Where is my oil from?" (SPEC M6 and M7), monthly in thousand barrels.
// -> public/data/oil-origins.json: crude imports by country of origin, receipts from other PADDs by mode,
//    refinery input and field production, plus refinery count and capacity.
// -> public/data/fuel-origins.json: gasoline, diesel and jet fuel used in each PADD (product supplied),
//    received from other PADDs and imported by country, with fuel ethanol beside gasoline.
// Needs EIA_API_KEY (free at eia.gov/opendata): in .env locally, as a secret in GitHub Actions.
// Run: npm run fetch:eia

import { ETHANOL_PRODUCT, EIA, FUELS, PADDS, type PaddId } from '../src/lib/config';
import type { OilOriginRegion } from '../src/types';
import {
  eiaResponseSchema,
  importsByPadd,
  productionByPadd,
  receiptsByPadd,
  refineryInputByPadd,
  toFuelRegions,
  toRegions,
  type EiaRow,
} from './lib/eia';
import { fetchJson } from './lib/http';
import { publishDataset, report } from './lib/output';
import { fuelOriginRegionSchema, oilOriginRegionSchema } from './lib/schemas';

const key = process.env.EIA_API_KEY;
if (!key) throw new Error('EIA_API_KEY is not set: add it to .env locally, or as an Actions secret');

/** Every row of one route, paged. The key goes in the query string, as EIA requires. */
async function rows(route: string, facets: Record<string, string[]>, frequency = 'monthly', start?: string): Promise<EiaRow[]> {
  const out: EiaRow[] = [];
  for (let offset = 0; ; offset += EIA.pageSize) {
    const params = new URLSearchParams({ api_key: key!, frequency, 'data[0]': 'value', offset: String(offset), length: String(EIA.pageSize) });
    if (start) params.set('start', start);
    for (const [facet, values] of Object.entries(facets)) for (const v of values) params.append(`facets[${facet}][]`, v);
    const body = eiaResponseSchema.parse(
      await fetchJson(`${EIA.apiUrl}/${route}/data/?${params}`, {
        source: 'EIA',
        timeoutMs: 90_000,
        bodyError: (b) => (b && typeof b === 'object' && 'error' in b ? JSON.stringify(b.error) : null),
      }),
    );
    out.push(...body.response.data);
    if (body.response.data.length < EIA.pageSize || out.length >= Number(body.response.total)) return out;
  }
}

const now = new Date();
const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - EIA.months - 3, 1));
const start = startDate.toISOString().slice(0, 7);
const crude = { product: ['EPC0'] };

const result = await publishDataset({
  id: 'oil-origins',
  schema: oilOriginRegionSchema,
  produce: async () => {
    const [imports, total, pipeline, tankerBarge, rail, input, production, capacityRows] = await Promise.all([
      rows('petroleum/move/impcp', { ...crude, process: ['IP0'] }, 'monthly', start),
      rows('petroleum/move/ptb', crude, 'monthly', start),
      rows('petroleum/move/pipe', crude, 'monthly', start),
      rows('petroleum/move/tb', crude, 'monthly', start),
      rows('petroleum/move/rail', crude, 'monthly', start),
      rows('petroleum/pnp/inpt', crude, 'monthly', start),
      rows('petroleum/crd/crpdn', crude, 'monthly', start),
      // Operable refineries (8O0) and atmospheric crude distillation capacity (8D0), as of 1 January.
      rows('petroleum/pnp/cap1', { process: ['8O0', '8D0'], duoarea: PADDS.map((p) => p.eia) }, 'annual', String(now.getUTCFullYear() - 2)),
    ]);
    const capacity = new Map<PaddId, OilOriginRegion['capacity']>();
    for (const padd of PADDS) {
      const mine = capacityRows.filter((r) => r.duoarea === padd.eia && r.value !== null);
      const latest = mine.map((r) => r.period).sort().at(-1);
      const count = mine.find((r) => r.period === latest && r.units === 'COUNT');
      const bcd = mine.find((r) => r.period === latest && r.units === 'B/CD');
      if (latest && count && bcd) capacity.set(padd.id, { asOf: latest, refineries: Number(count.value), barrelsPerCalendarDay: Number(bcd.value) });
    }
    const regions = toRegions(
      {
        imports: importsByPadd(imports),
        receipts: receiptsByPadd({ total, pipeline, tankerBarge, rail }),
        input: refineryInputByPadd(input),
        production: productionByPadd(production),
      },
      { months: EIA.months, capacity },
    );
    const periods = regions[0]?.months.map((m) => m.period) ?? [];
    return {
      records: regions,
      meta: {
        sourceUrl: 'https://www.eia.gov/opendata/',
        sourceVersion: `EIA API v2: petroleum/move/impcp (IP0), move/ptb, pipe, tb, rail, pnp/inpt, crd/crpdn (crude oil, MBBL), pnp/cap1; ${periods[0]} to ${periods.at(-1)}`,
        license: 'Public domain (U.S. Energy Information Administration)',
        dataThrough: periods.at(-1),
      },
    };
  },
});
report(result, 'oil-origins');

const fuelProducts = [...new Set([...FUELS.flatMap((f) => f.products), ETHANOL_PRODUCT])];
const fuels = await publishDataset({
  id: 'fuel-origins',
  schema: fuelOriginRegionSchema,
  produce: async () => {
    const product = { product: fuelProducts };
    const [supplied, imports, total, pipeline, tankerBarge, rail] = await Promise.all([
      rows('petroleum/cons/psup', { product: FUELS.map((f) => f.supplied), duoarea: PADDS.map((p) => p.eia) }, 'monthly', start),
      rows('petroleum/move/impcp', { ...product, process: ['IM0'] }, 'monthly', start),
      rows('petroleum/move/ptb', product, 'monthly', start),
      rows('petroleum/move/pipe', product, 'monthly', start),
      rows('petroleum/move/tb', product, 'monthly', start),
      rows('petroleum/move/rail', product, 'monthly', start),
    ]);
    const records = toFuelRegions({ supplied, imports, receipts: { total, pipeline, tankerBarge, rail } }, { months: EIA.months });
    const periods = records[0]?.months.map((m) => m.period) ?? [];
    return {
      records,
      meta: {
        sourceUrl: 'https://www.eia.gov/opendata/',
        sourceVersion: `EIA API v2: petroleum/cons/psup, move/impcp (IM0), move/ptb, pipe, tb, rail (${fuelProducts.join(', ')}, MBBL); ${periods[0]} to ${periods.at(-1)}`,
        license: 'Public domain (U.S. Energy Information Administration)',
        dataThrough: periods.at(-1),
      },
    };
  },
});
report(fuels, 'fuel-origins');
