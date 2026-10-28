// Scheduled: ENTSOG physical gas flows and firm technical capacity at the points in
// ENTSOG.points (src/lib/config.ts) -> public/data/gas-flows.json
// Run: npm run fetch:entsog

import { ENTSOG, entsogSeriesId } from '../src/lib/config';
import { toFlowSeries, operationalResponseSchema, type OperationalRow } from './lib/entsog';
import { fetchJson } from './lib/http';
import { publishDataset, report } from './lib/output';
import { addDays, dataThrough } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';

type Point = (typeof ENTSOG.points)[number];

async function fetchIndicator(point: Point, indicator: string, from: string, to: string): Promise<OperationalRow[]> {
  const params = new URLSearchParams({
    operatorKey: point.operatorKey,
    pointKey: point.pointKey,
    directionKey: point.direction,
    indicator,
    periodType: 'day',
    from,
    to,
    timezone: 'UTC',
    limit: '-1',
    format: 'json',
  });
  try {
    const body = await fetchJson(`${ENTSOG.apiUrl}?${params}`, { source: 'ENTSOG', timeoutMs: 60_000 });
    return operationalResponseSchema.parse(body).operationaldatas;
  } catch (err) {
    // ENTSOG answers 404 when a point has no rows for the period.
    if (err instanceof Error && err.message.endsWith('404')) return [];
    throw err;
  }
}

const today = new Date().toISOString().slice(0, 10);
const from = addDays(today, -ENTSOG.keepDays);

const result = await publishDataset({
  id: 'gas-flows',
  schema: observationSeriesSchema,
  produce: async () => {
    const series = [];
    for (const point of ENTSOG.points) {
      const flows = await fetchIndicator(point, 'Physical Flow', from, today);
      const capacity = await fetchIndicator(point, 'Firm Technical', addDays(today, -14), today);
      series.push(toFlowSeries(entsogSeriesId(point), point.label, flows, capacity, { today, ...ENTSOG }));
    }
    return {
      records: series,
      meta: {
        sourceUrl: 'https://transparency.entsog.eu/',
        sourceVersion: `ENTSOG Transparency Platform API v1, Physical Flow and Firm Technical, daily, from ${from}`,
        license: 'ENTSOG Transparency Platform terms (attribution)',
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(result, 'gas-flows');
