// Scheduled: GIE ALSI daily send-out by LNG import terminal -> public/data/lng-sendout.json
// Uses AGSI_API_KEY (one GIE account covers AGSI+ and ALSI): in .env locally, as a secret in GitHub Actions.
// Run: npm run fetch:alsi

import { readFile } from 'node:fs/promises';
import { ALSI, alsiSeriesId } from '../src/lib/config';
import { sendOutResponseSchema, toSendOutSeries, type SendOutRow } from './lib/alsi';
import { withCause } from './lib/http';
import { publishDataset, report } from './lib/output';
import { addDays, dataThrough } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';
import type { LngTerminal } from '../src/types';

const ATTEMPTS = 3;
/** ALSI now and then answers a facility with an empty page; asking again usually gets the data. */
const EMPTY_RETRIES = 2;
const PAUSE_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, key: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'x-key': key }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`ALSI responded ${response.status}`);
      const body = (await response.json()) as { error?: string; message?: string };
      // Like AGSI+, ALSI answers a bad key with 200 and an error body.
      if (body.error) throw new Error(`ALSI error: ${body.error}${body.message ? `, ${body.message}` : ''}`);
      return body;
    } catch (err) {
      lastError = withCause(err, 'ALSI');
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

type Facility = (typeof ALSI.terminals)[number]['facilities'][number];

async function fetchFacility(facility: Facility, from: string, to: string, key: string): Promise<SendOutRow[]> {
  for (let attempt = 0; ; attempt++) {
    const rows = await fetchFacilityPages(facility, from, to, key);
    if (rows.length || attempt >= EMPTY_RETRIES) return rows;
    await sleep(2_000 * (attempt + 1));
  }
}

async function fetchFacilityPages(facility: Facility, from: string, to: string, key: string): Promise<SendOutRow[]> {
  const rows: SendOutRow[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      country: facility.country,
      company: facility.company,
      facility: facility.eic,
      from,
      to,
      size: String(ALSI.pageSize),
      page: String(page),
    });
    await sleep(PAUSE_MS);
    const body = sendOutResponseSchema.parse(await fetchPage(`${ALSI.apiUrl}?${params}`, key));
    rows.push(...body.data);
    if (page >= body.last_page) return rows;
  }
}

const today = new Date().toISOString().slice(0, 10);
const from = addDays(today, -ALSI.keepDays);

const result = await publishDataset({
  id: 'lng-sendout',
  schema: observationSeriesSchema,
  produce: async () => {
    const key = process.env.AGSI_API_KEY;
    if (!key) throw new Error('AGSI_API_KEY is not set');
    // Terminal names for labels come from the published GEM terminals.
    const terminals = JSON.parse(await readFile('public/data/lng-terminals.json', 'utf8')) as LngTerminal[];
    const nameOf = new Map(terminals.map((t) => [t.id, t.name]));
    const series = [];
    const empty: string[] = [];
    for (const terminal of ALSI.terminals) {
      const rows = [];
      for (const facility of terminal.facilities) rows.push(await fetchFacility(facility, from, today, key));
      const name = nameOf.get(terminal.terminalId) ?? terminal.terminalId;
      const s = toSendOutSeries(alsiSeriesId(terminal.terminalId), name, rows, { today, ...ALSI });
      if (s) series.push(s);
      else empty.push(name);
    }
    return {
      records: series,
      meta: {
        sourceUrl: 'https://alsi.gie.eu/',
        sourceVersion: `GIE ALSI API, daily send-out (GWh/d, stored as kWh/d) and declared send-out capacity, from ${from}${empty.length ? `; no data for ${empty.join(', ')}` : ''}`,
        license: 'GIE ALSI terms (attribution)',
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(result, 'lng-sendout');
