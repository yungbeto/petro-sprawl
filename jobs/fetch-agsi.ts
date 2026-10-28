// Scheduled: GIE AGSI+ gas storage fill by country -> public/data/gas-storage.json
// Needs AGSI_API_KEY (free account at agsi.gie.eu): in .env locally, as a secret in GitHub Actions.
// Run: npm run fetch:agsi

import { AGSI, agsiSeriesId } from '../src/lib/config';
import { formatCountry } from '../src/lib/format';
import { storageResponseSchema, toStorageSeries, type StorageRow } from './lib/agsi';
import { publishDataset, report } from './lib/output';
import { addDays, dataThrough } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';

const ATTEMPTS = 3;

async function fetchPage(url: string, key: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'x-key': key }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`AGSI+ responded ${response.status}`);
      const body = (await response.json()) as { error?: string; message?: string };
      // AGSI+ answers a bad key with 200 and an error body.
      if (body.error) throw new Error(`AGSI+ error: ${body.error}${body.message ? `, ${body.message}` : ''}`);
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchCountry(country: string, from: string, to: string, key: string): Promise<StorageRow[]> {
  const rows: StorageRow[] = [];
  for (let page = 1; ; page++) {
    const slug = AGSI.slugs[country] ?? country;
    const params = new URLSearchParams({ country: slug, from, to, size: String(AGSI.pageSize), page: String(page) });
    const body = storageResponseSchema.parse(await fetchPage(`${AGSI.apiUrl}?${params}`, key));
    rows.push(...body.data);
    if (page >= body.last_page) return rows;
  }
}

const today = new Date().toISOString().slice(0, 10);
const from = addDays(today, -AGSI.keepDays);

const result = await publishDataset({
  id: 'gas-storage',
  schema: observationSeriesSchema,
  produce: async () => {
    const key = process.env.AGSI_API_KEY;
    if (!key) throw new Error('AGSI_API_KEY is not set');
    const series = [];
    const empty: string[] = [];
    for (const country of AGSI.countries) {
      const rows = await fetchCountry(country, from, today, key);
      const s = toStorageSeries(agsiSeriesId(country), formatCountry(country), rows, { today, ...AGSI });
      if (s) series.push(s);
      else empty.push(country);
    }
    return {
      records: series,
      meta: {
        sourceUrl: 'https://agsi.gie.eu/',
        sourceVersion: `GIE AGSI+ API, daily fill (% of working gas volume), from ${from}${empty.length ? `; no data for ${empty.join(', ')}` : ''}`,
        license: 'GIE AGSI+ terms (attribution)',
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(result, 'gas-storage');
