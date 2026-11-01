// Scheduled: gas in storage outside AGSI+ (SPEC M10), one dataset per source, each kept or failed on its own.
// -> public/data/gas-storage-us.json: EIA weekly working gas, Lower 48 and its five regions (Bcf). Needs EIA_API_KEY.
// -> public/data/gas-storage-ca.json: Statistics Canada monthly closing inventory, Canada and provinces (million m³).
// -> public/data/gas-storage-jodi.json: JODI-Gas monthly closing stocks by country (million m³).
// Run: npm run fetch:storage

import { EIA, EIA_STORAGE, JODI_GAS, STATCAN_STORAGE } from '../src/lib/config';
import { formatCountry } from '../src/lib/format';
import { fetchJson, withCause } from './lib/http';
import { publishDataset, report } from './lib/output';
import { addDays, dataThrough } from './lib/portwatch';
import { observationSeriesSchema } from './lib/schemas';
import {
  eiaStorageRowSchema,
  eiaStorageSeries,
  jodiStorageSeries,
  statcanCoordinate,
  statcanResponseSchema,
  statcanStorageSeries,
  type EiaStorageRow,
} from './lib/storage';
import { unzipEntry } from './lib/unzip';
import { z } from 'zod';

const today = new Date().toISOString().slice(0, 10);
const monthsBack = (months: number) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 7);
};

// EIA, weekly by region

const us = await publishDataset({
  id: 'gas-storage-us',
  schema: observationSeriesSchema,
  produce: async () => {
    const key = process.env.EIA_API_KEY;
    if (!key) throw new Error('EIA_API_KEY is not set');
    const start = addDays(today, -EIA_STORAGE.keepDays);
    const series = [EIA_STORAGE.total, ...EIA_STORAGE.regions].map((r) => r.series);
    const rows: EiaStorageRow[] = [];
    for (let offset = 0; ; offset += EIA.pageSize) {
      const params = new URLSearchParams({ api_key: key, frequency: 'weekly', 'data[0]': 'value', start, offset: String(offset), length: String(EIA.pageSize) });
      for (const s of series) params.append('facets[series][]', s);
      const body = z
        .object({ response: z.object({ total: z.union([z.number(), z.string()]), data: z.array(eiaStorageRowSchema) }) })
        .parse(
          await fetchJson(`${EIA.apiUrl}/${EIA_STORAGE.route}/data/?${params}`, {
            source: 'EIA',
            timeoutMs: 90_000,
            bodyError: (b) => (b && typeof b === 'object' && 'error' in b ? JSON.stringify(b.error) : null),
          }),
        );
      rows.push(...body.response.data);
      if (body.response.data.length < EIA.pageSize || rows.length >= Number(body.response.total)) break;
    }
    const records = eiaStorageSeries(rows, today);
    return {
      records,
      meta: {
        sourceUrl: 'https://ir.eia.gov/ngs/ngs.html',
        sourceVersion: `EIA API v2 ${EIA_STORAGE.route}, weekly working gas in underground storage (Bcf), from ${start}`,
        license: 'Public domain (U.S. Energy Information Administration)',
        dataThrough: dataThrough(records),
      },
    };
  },
});
report(us, 'gas-storage-us');

// Statistics Canada, monthly by province

const ca = await publishDataset({
  id: 'gas-storage-ca',
  schema: observationSeriesSchema,
  produce: async () => {
    const members = [STATCAN_STORAGE.total.member, ...STATCAN_STORAGE.provinces.map((p) => p.member)];
    const request = members.map((m) => ({ productId: STATCAN_STORAGE.productId, coordinate: statcanCoordinate(m), latestN: STATCAN_STORAGE.months }));
    let body: unknown;
    try {
      const response = await fetch(`${STATCAN_STORAGE.apiUrl}/getDataFromCubePidCoordAndLatestNPeriods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Statistics Canada responded ${response.status}`);
      body = await response.json();
    } catch (err) {
      throw withCause(err, 'Statistics Canada');
    }
    const records = statcanStorageSeries(statcanResponseSchema.parse(body), today);
    return {
      records,
      meta: {
        sourceUrl: STATCAN_STORAGE.tableUrl,
        sourceVersion: `Statistics Canada table ${STATCAN_STORAGE.table}, closing inventory in storage (thousand m³, published as million m³), latest ${STATCAN_STORAGE.months} months`,
        license: 'Statistics Canada Open Licence',
        dataThrough: dataThrough(records),
      },
    };
  },
});
report(ca, 'gas-storage-ca');

// JODI-Gas, monthly by country

const jodi = await publishDataset({
  id: 'gas-storage-jodi',
  schema: observationSeriesSchema,
  produce: async () => {
    const listing = z
      .object({ publicationId: z.number().int(), files: z.array(z.object({ filename: z.string() })) })
      .parse(await fetchJson(JODI_GAS.filesUrl, { source: 'JODI' }));
    if (!listing.files.some((f) => f.filename === JODI_GAS.file)) throw new Error(`JODI listing has no ${JODI_GAS.file}`);
    const url = `${JODI_GAS.downloadUrl}/${listing.publicationId}/${JODI_GAS.file}`;
    let zip: Buffer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`JODI responded ${response.status}`);
      zip = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      throw withCause(err, 'JODI');
    }
    const csv = unzipEntry(zip, (name) => name.endsWith('.csv')).toString('utf8');
    const fromMonth = monthsBack(JODI_GAS.months);
    const { series, stale, none } = jodiStorageSeries(csv, { today, fromMonth, label: formatCountry });
    if (series.length < 10) throw new Error(`JODI: only ${series.length} countries with closing stocks`);
    return {
      records: series,
      meta: {
        sourceUrl: JODI_GAS.pageUrl,
        sourceVersion: `JODI-Gas world database, publication ${listing.publicationId}, closing stocks (${JODI_GAS.flow}, million m³), assessments ${JODI_GAS.assessments.join(' and ')}, from ${fromMonth}${stale.length ? `; left out as stale: ${stale.join(', ')}` : ''}${none.length ? `; no stocks: ${none.join(', ')}` : ''}`,
        license: `JODI terms of use; cited as: ${JODI_GAS.citation}, accessed ${today}`,
        dataThrough: dataThrough(series),
      },
    };
  },
});
report(jodi, 'gas-storage-jodi');
