// Scheduled (SPEC M12): EIA's monthly tight oil and shale gas production by formation, and rigs and wells in
// its five shale regions, from the Short-Term Energy Outlook data (table 10b and the Drilling Productivity
// Report's series, in STEO since 11 June 2024) -> public/data/shale-production.json. History only: STEO mixes
// history and forecast with no flag, so the release date comes from EIA's STEO page and any value at or after
// the release month fails the run (toShaleSeries). Needs EIA_API_KEY. Run: npm run fetch:shale

import { EIA, SHALE } from '../src/lib/config';
import { fetchJson, withCause } from './lib/http';
import { publishDataset, report } from './lib/output';
import { shaleSeriesSchema } from './lib/schemas';
import { shaleSeriesIds, steoReleaseDate, toShaleSeries, type SteoRow } from './lib/shale';
import { z } from 'zod';

const key = process.env.EIA_API_KEY;
if (!key) throw new Error('EIA_API_KEY is not set: add it to .env locally, or as an Actions secret');

const STEO_PAGE = 'https://www.eia.gov/outlooks/steo/';
const UA = 'Mozilla/5.0 (compatible; petro-sprawl data job)';

const steoResponse = z.object({
  response: z.object({
    total: z.union([z.number(), z.string()]),
    data: z.array(
      z.object({
        period: z.string(),
        seriesId: z.string(),
        seriesDescription: z.string(),
        value: z.union([z.number(), z.string(), z.null()]),
        unit: z.string().nullable().optional(),
      }),
    ),
  }),
});

async function releaseDate(): Promise<string> {
  let html: string;
  try {
    const res = await fetch(STEO_PAGE, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    throw withCause(err, 'EIA STEO page');
  }
  const date = steoReleaseDate(html);
  if (!date) throw new Error(`no release date on ${STEO_PAGE}: the page changed`);
  return date;
}

async function rows(ids: string[], start: string): Promise<SteoRow[]> {
  const out: SteoRow[] = [];
  for (let offset = 0; ; offset += EIA.pageSize) {
    const params = new URLSearchParams({ api_key: key!, frequency: 'monthly', 'data[0]': 'value', start, offset: String(offset), length: String(EIA.pageSize) });
    for (const id of ids) params.append('facets[seriesId][]', id);
    const body = steoResponse.parse(
      await fetchJson(`${EIA.apiUrl}/steo/data/?${params}`, {
        source: 'EIA STEO',
        timeoutMs: 90_000,
        bodyError: (b) => (b && typeof b === 'object' && 'error' in b ? JSON.stringify(b.error) : null),
      }),
    );
    out.push(...body.response.data);
    if (body.response.data.length < EIA.pageSize || out.length >= Number(body.response.total)) return out;
  }
}

const result = await publishDataset({
  id: 'shale-production',
  schema: shaleSeriesSchema,
  produce: async () => {
    const release = await releaseDate();
    const wanted = shaleSeriesIds();
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SHALE.months - 3, 1)).toISOString().slice(0, 7);
    const series = toShaleSeries(await rows(wanted.map((w) => w.id), start), wanted, release);
    const through = series.map((s) => s.points.at(-1)!.period).sort().at(-1);
    return {
      records: series,
      meta: {
        sourceUrl: SHALE.steoPage,
        sourceVersion: `EIA Short-Term Energy Outlook released ${release}, history only`,
        license: 'Public domain (EIA)',
        ...(through ? { dataThrough: through } : {}),
      },
    };
  },
});
report(result, 'shale-production');
