// Manual import: GEM LNG terminals tracker (one row per unit) -> public/data/lng-terminals.json, one record per terminal.
// Put the tracker's GeoJSON download in data/raw/gem/ (path below), then: npm run import:lng
// Writes data/reports/import-lng.json with counts of every unit skipped and why.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { FeatureCollection, Point } from 'geojson';
import { lngTerminals, type GemLngRow } from './lib/lng';
import { publishDataset, report as reportResult, sha256File } from './lib/output';
import { lngTerminalSchema } from './lib/schemas';

const TRACKER = {
  sourceId: 'gem-ggit-lng-terminals-2026-10',
  path: 'data/raw/gem/GEM-GGIT-LNG-Terminals-2026-10/GEM-GGIT-LNG-Terminals-2026-10.geojson',
  releaseDate: '2026-10',
};
const REPORT_PATH = 'data/reports/import-lng.json';

const recordedAt = new Date().toISOString().slice(0, 10);
const collection = JSON.parse(await readFile(TRACKER.path, 'utf8')) as FeatureCollection<Point, GemLngRow>;
const rows = collection.features.map((f) => f.properties);
const { terminals, skipped, unresolvedCountries } = lngTerminals(rows, { recordedAt, releaseDate: TRACKER.releaseDate });
const sha256 = await sha256File(TRACKER.path);

const result = await publishDataset({
  id: 'lng-terminals',
  schema: lngTerminalSchema,
  produce: async () => ({
    records: terminals,
    meta: {
      sourceUrl: 'https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/',
      sourceVersion: `${TRACKER.sourceId} sha256:${sha256}`,
      license: 'CC BY 4.0, Global Energy Monitor',
    },
  }),
});
reportResult(result, 'lng-terminals');
if (result.ok) {
  await mkdir('data/reports', { recursive: true });
  const report = { recordedAt, file: TRACKER.path, sha256, units: rows.length, terminals: terminals.length, skipped, unresolvedCountries };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report in ${REPORT_PATH}`);
}
