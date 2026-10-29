// Scheduled: IMF PortWatch daily tanker transits for our seven chokepoints -> public/data/chokepoint-transits.json
// Run: npm run fetch:portwatch

import { CHOKEPOINTS, FLOW_WINDOWS, PORTWATCH } from '../src/lib/config';
import { fetchJson } from './lib/http';
import { publishDataset, report } from './lib/output';
import { addDays, dailyResponseSchema, dataThrough, dateWindows, toTransitSeries, type DailyRow } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';

// One row per day, so a 1,000-day window fits one response and needs no paging. Each query
// costs 12 to 17 s whatever its size, so fewer, larger windows are faster. No ordering or
// offsets, to give the overloaded service the least work; toTransitSeries sorts.
const WINDOW_DAYS = 1000;

async function fetchRows(portwatchId: string, since: string, until: string): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  for (const [from, to] of dateWindows(since, until, WINDOW_DAYS)) {
    const params = new URLSearchParams({
      where: `portid='${portwatchId}' AND date >= DATE '${from}' AND date <= DATE '${to}'`,
      outFields: 'date,portid,n_tanker',
      resultRecordCount: '1000',
      f: 'json',
    });
    // ArcGIS answers 200 with an error body, sometimes transiently (seen 2026-10-28), so retry those too.
    // Since 2026-10-28 it fails about half its queries at random with "Invalid query parameters" after
    // 12 to 15 s, then answers the same query at once; three quick attempts failed three runs in a row.
    const body = await fetchJson(`${PORTWATCH.dailyUrl}?${params}`, {
      source: 'PortWatch',
      attempts: PORTWATCH.attempts,
      bodyError: (b) => (b && typeof b === 'object' && 'error' in b ? JSON.stringify(b.error) : null),
    });
    const page = dailyResponseSchema.parse(body);
    if (page.exceededTransferLimit) throw new Error(`PortWatch returned more than one page for ${portwatchId} ${from} to ${to}`);
    rows.push(...page.features.map((f) => f.attributes));
  }
  return rows;
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
      const rows = await fetchRows(chokepoint.portwatchId, since, today);
      console.log(`${chokepoint.portwatchId}: ${rows.length} rows`);
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
