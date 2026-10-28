// Scheduled: IMF PortWatch daily tanker transits for our seven chokepoints -> public/data/chokepoint-transits.json
// Run: npm run fetch:portwatch

import { CHOKEPOINTS, FLOW_WINDOWS, PORTWATCH } from '../src/lib/config';
import { publishDataset, report } from './lib/output';
import { addDays, dailyResponseSchema, dataThrough, toTransitSeries, type DailyRow } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';

const PAGE_SIZE = 1000;
const ATTEMPTS = 3;

/** ArcGIS endpoints are occasionally slow; retry with backoff before failing the run. */
async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`PortWatch responded ${response.status}`);
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchRows(portwatchId: string, since: string): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: `portid='${portwatchId}' AND date >= DATE '${since}'`,
      outFields: 'date,portid,n_tanker',
      orderByFields: 'date ASC',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'json',
    });
    const body = await fetchJson(`${PORTWATCH.dailyUrl}?${params}`);
    if (body && typeof body === 'object' && 'error' in body) throw new Error(`PortWatch error: ${JSON.stringify(body.error)}`);
    const page = dailyResponseSchema.parse(body);
    rows.push(...page.features.map((f) => f.attributes));
    if (!page.exceededTransferLimit) return rows;
  }
}

const today = new Date().toISOString().slice(0, 10);
// Enough history for the five-year baseline that sits before the trailing year, plus slack.
const since = addDays(today, -(FLOW_WINDOWS.trailingDays + FLOW_WINDOWS.fiveYearDays + 30));

const result = await publishDataset({
  id: 'chokepoint-transits',
  schema: observationSeriesSchema,
  produce: async () => {
    const series = [];
    for (const chokepoint of CHOKEPOINTS) {
      const rows = await fetchRows(chokepoint.portwatchId, since);
      series.push(toTransitSeries(chokepoint.portwatchId, rows, { today, ...PORTWATCH }));
    }
    return {
      records: series,
      meta: {
        sourceUrl: PORTWATCH.dailyUrl.replace(/\/query$/, ''),
        sourceVersion: `IMF PortWatch Daily_Chokepoints_Data, n_tanker; points from ${addDays(today, -PORTWATCH.keepDays)}, five-year baseline from history since ${since}`,
        license: 'IMF PortWatch terms (attribution)',
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(result, 'chokepoint-transits');
