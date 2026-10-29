// Scheduled: IMF PortWatch daily tanker transits and estimated tanker cargo (metric tons) for our seven
// chokepoints -> public/data/chokepoint-transits.json, and daily tanker port calls and estimated tanker
// exports at the ports in PORT_CALLS -> public/data/port-calls.json. Both fields come from one query.
// Run: npm run fetch:portwatch

import { CHOKEPOINTS, FLOW_WINDOWS, PORT_CALLS, PORTWATCH, portExportsSeriesId, tankerCargoSeriesId } from '../src/lib/config';
import { fetchJson } from './lib/http';
import { publishDataset, report } from './lib/output';
import {
  addDays,
  dailyResponseSchema,
  dataThrough,
  dateWindows,
  toTransitSeries,
  type DailyRow,
} from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';

// One row per day, so a 1,000-day window fits one response and needs no paging. Each query
// costs 12 to 17 s whatever its size, so fewer, larger windows are faster. No ordering or
// offsets, to give the overloaded service the least work; toTransitSeries sorts.
const WINDOW_DAYS = 1000;

interface Layer {
  url: string;
  fields: readonly string[];
}

const CHOKEPOINT_LAYER: Layer = { url: PORTWATCH.dailyUrl, fields: ['n_tanker', 'capacity_tanker'] };
const PORT_LAYER: Layer = { url: PORT_CALLS.dailyUrl, fields: ['portcalls_tanker', 'export_tanker'] };

async function fetchRows(layer: Layer, portwatchId: string, since: string, until: string): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  const schema = dailyResponseSchema(layer.fields);
  for (const [from, to] of dateWindows(since, until, WINDOW_DAYS)) {
    const params = new URLSearchParams({
      where: `portid='${portwatchId}' AND date >= DATE '${from}' AND date <= DATE '${to}'`,
      outFields: `date,portid,${layer.fields.join(',')}`,
      resultRecordCount: '1000',
      f: 'json',
    });
    // ArcGIS answers 200 with an error body, sometimes transiently (seen 2026-10-28), so retry those too.
    // Since 2026-10-28 it fails about half its queries at random with "Invalid query parameters" after
    // 12 to 15 s, then answers the same query at once; three quick attempts failed three runs in a row.
    const body = await fetchJson(`${layer.url}?${params}`, {
      source: 'PortWatch',
      attempts: PORTWATCH.attempts,
      bodyError: (b) => (b && typeof b === 'object' && 'error' in b ? JSON.stringify(b.error) : null),
    });
    const page = schema.parse(body);
    if (page.exceededTransferLimit) throw new Error(`PortWatch returned more than one page for ${portwatchId} ${from} to ${to}`);
    rows.push(...page.features.map((f) => f.attributes));
  }
  return rows;
}

const today = new Date().toISOString().slice(0, 10);
// Enough history for the five-year baseline that sits before the trailing year, plus slack.
const since = addDays(today, -(FLOW_WINDOWS.trailingDays + FLOW_WINDOWS.fiveYearDays + 30));
// PortWatch asks to be cited as "Sources: UN Global Platform; IMF PortWatch".
const license = 'IMF PortWatch terms (attribution); AIS data from the UN Global Platform';

const transits = await publishDataset({
  id: 'chokepoint-transits',
  schema: observationSeriesSchema,
  produce: async () => {
    const series = [];
    for (const chokepoint of CHOKEPOINTS) {
      const rows = await fetchRows(CHOKEPOINT_LAYER, chokepoint.portwatchId, since, today);
      console.log(`${chokepoint.portwatchId}: ${rows.length} rows`);
      series.push(toTransitSeries(chokepoint.portwatchId, rows, { today, ...PORTWATCH }));
      series.push(
        toTransitSeries(chokepoint.portwatchId, rows, {
          today,
          ...PORTWATCH,
          metric: 'tanker_cargo_t',
          field: 'capacity_tanker',
          unit: 't/day',
          id: tankerCargoSeriesId(chokepoint.portwatchId),
        }),
      );
    }
    return {
      records: series,
      meta: {
        sourceUrl: PORTWATCH.dailyUrl.replace(/\/query$/, ''),
        sourceVersion: `IMF PortWatch Daily_Chokepoints_Data, n_tanker and capacity_tanker; points from ${addDays(today, -PORTWATCH.keepDays)}, five-year baseline from history since ${since}`,
        license,
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(transits, 'chokepoint-transits');

const portCalls = await publishDataset({
  id: 'port-calls',
  schema: observationSeriesSchema,
  produce: async () => {
    const series = [];
    for (const port of PORT_CALLS.ports) {
      const rows = await fetchRows(PORT_LAYER, port.portwatchId, since, today);
      console.log(`${port.portwatchId}: ${rows.length} rows`);
      const common = { today, ...PORTWATCH, label: port.name };
      series.push(toTransitSeries(port.portwatchId, rows, { ...common, metric: 'tanker_port_calls', field: 'portcalls_tanker' }));
      series.push(
        toTransitSeries(port.portwatchId, rows, {
          ...common,
          metric: 'tanker_exports_t',
          field: 'export_tanker',
          unit: 't/day',
          id: portExportsSeriesId(port.portwatchId),
        }),
      );
    }
    return {
      records: series,
      meta: {
        sourceUrl: PORT_CALLS.dailyUrl.replace(/\/query$/, ''),
        sourceVersion: `IMF PortWatch Daily_Ports_Data, portcalls_tanker and export_tanker; points from ${addDays(today, -PORTWATCH.keepDays)}, five-year baseline from history since ${since}`,
        license,
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(portCalls, 'port-calls');
