// Scheduled: crude imports by partner country (SPEC M10) -> public/data/crude-imports.json
// Eurostat nrg_ti_oilm (monthly, no key) for the EU and the neighbours it reports; UN Comtrade HS 2709
// (annual) for the other largest importers, refreshed weekly; EIA (public/data/oil-origins.json, so run
// fetch:eia first) for the United States.
// Comtrade takes COMTRADE_API_KEY (free at comtradedeveloper.un.org) and, without one, its public preview.
// Run: npm run fetch:crude-imports

import { COMTRADE, CRUDE_IMPORTS, EUROSTAT_OIL } from '../src/lib/config';
import type { CountryCrudeImports, OilOriginRegion } from '../src/types';
import {
  addMonths,
  comtradeAreaSchema,
  comtradeImports,
  comtradeRowSchema,
  countryCodes,
  eiaImports,
  eurostatImports,
  importersByValue,
  jsonStatSchema,
  largestImporters,
  type ComtradeRow,
} from './lib/crudeImports';
import { fetchJson } from './lib/http';
import { publishDataset, readPublished, report } from './lib/output';
import { countryCrudeImportsSchema } from './lib/schemas';
import { z } from 'zod';

const ID = 'crude-imports';
const now = new Date();
const today = now.toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const key = process.env.COMTRADE_API_KEY;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function comtrade(params: Record<string, string>): Promise<ComtradeRow[]> {
  const query = new URLSearchParams({ cmdCode: COMTRADE.cmdCode, flowCode: 'M', ...params });
  const url = `${key ? COMTRADE.apiUrl : COMTRADE.previewUrl}?${query}`;
  await sleep(COMTRADE.gapMs);
  const body = await (key
    ? (async () => {
        const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key }, signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Comtrade responded ${response.status}`);
        return response.json() as Promise<unknown>;
      })()
    : fetchJson(url, { source: 'Comtrade', maxBackoffMs: 20_000 }));
  const parsed = z.object({ data: z.array(comtradeRowSchema), error: z.string().nullable().optional() }).parse(body);
  if (parsed.error) throw new Error(`Comtrade error: ${parsed.error}`);
  return parsed.data;
}

const result = await publishDataset({
  id: ID,
  schema: countryCrudeImportsSchema,
  produce: async () => {
    const [partnerAreas, reporterAreas] = await Promise.all([
      fetchJson(COMTRADE.partnersUrl, { source: 'Comtrade' }).then((b) => comtradeAreaSchema.parse(b).results),
      fetchJson(COMTRADE.reportersUrl, { source: 'Comtrade' }).then((b) => comtradeAreaSchema.parse(b).results),
    ]);
    const codes = countryCodes(partnerAreas);

    // Eurostat, monthly.
    const since = addMonths(thisMonth, -EUROSTAT_OIL.months);
    const params = new URLSearchParams({ format: 'JSON', lang: 'EN', siec: EUROSTAT_OIL.siec, unit: EUROSTAT_OIL.unit, sinceTimePeriod: since });
    const eurostat = eurostatImports(
      jsonStatSchema.parse(await fetchJson(`${EUROSTAT_OIL.apiUrl}?${params}`, { source: 'Eurostat', timeoutMs: 120_000 })),
      { codes, sinceMonth: addMonths(thisMonth, -8), retrieved: today },
    );
    if (eurostat.length < 20) throw new Error(`Eurostat: only ${eurostat.length} reporters`);

    // Comtrade, annual: reused while the last retrieval is under refreshDays old.
    const previous = await readPublished<CountryCrudeImports>(ID);
    const lastComtrade = previous.filter((r) => r.source === 'comtrade').map((r) => r.retrieved).sort()[0];
    const fresh = !!lastComtrade && now.getTime() - Date.parse(lastComtrade) < COMTRADE.refreshDays * 86_400_000;
    let ranked: Map<string, CountryCrudeImports['importsUsd']>;
    let fromComtrade: CountryCrudeImports[];
    const covered = new Set([...eurostat.map((r) => r.id), 'US']);
    if (fresh) {
      ranked = new Map(previous.flatMap((r) => (r.importsUsd ? [[r.id, r.importsUsd] as const] : [])));
      fromComtrade = previous.filter((r) => r.source === 'comtrade' && !covered.has(r.id)).map((r) => ({ ...r, iso3: r.iso3 ?? codes.iso3.get(r.id) ?? null }));
    } else {
      const year = now.getUTCFullYear();
      const world = [...(await comtrade({ period: String(year - 2), partnerCode: '0' })), ...(await comtrade({ period: String(year - 1), partnerCode: '0' }))];
      const byValue = importersByValue(world, reporterAreas);
      if (byValue.size < 50) throw new Error(`Comtrade: only ${byValue.size} reporters of crude imports`);
      ranked = new Map([...byValue].map(([id, v]) => [id, { year: v.year, value: v.value }]));
      fromComtrade = [];
      for (const id of largestImporters(byValue)) {
        if (covered.has(id)) continue;
        const { year: period, code } = byValue.get(id)!;
        const record = comtradeImports(id, await comtrade({ period, reporterCode: String(code) }), {
          partners: partnerAreas,
          importsUsd: ranked.get(id) ?? null,
          iso3: codes.iso3.get(id) ?? null,
          retrieved: today,
        });
        if (record) fromComtrade.push(record);
      }
    }

    // EIA, for the United States.
    const us = eiaImports(await readPublished<OilOriginRegion>('oil-origins'), { codes, importsUsd: ranked.get('US') ?? null, retrieved: today });

    const records = [...eurostat.map((r) => ({ ...r, importsUsd: ranked.get(r.id) ?? null })), ...(us ? [us] : []), ...fromComtrade].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const latest = largestImporters(new Map([...ranked].flatMap(([id, v]) => (v ? [[id, v] as const] : []))));
    const missing = latest.filter((id) => !records.some((r) => r.id === id));
    return {
      records,
      meta: {
        sourceUrl: EUROSTAT_OIL.pageUrl,
        sourceVersion: `Eurostat ${EUROSTAT_OIL.dataset} (${EUROSTAT_OIL.siec}, thousand tonnes) from ${since}; UN Comtrade HS ${COMTRADE.cmdCode} imports, annual, ${key ? 'API' : 'public preview'}${fresh ? ', reused from the last fetch' : ''}; EIA crude imports by PADD for the US. Shares computed here.${missing.length ? ` Not covered among the ${CRUDE_IMPORTS.largest} largest: ${missing.join(', ')}` : ''}`,
        license: 'Eurostat: CC BY 4.0, shares computed from the source; UN Comtrade: derived shares, cited as UN Comtrade (permission asked 2026-11-01); EIA: public domain',
        dataThrough: records.map((r) => r.to).sort().at(-1),
      },
    };
  },
});
report(result, ID);
