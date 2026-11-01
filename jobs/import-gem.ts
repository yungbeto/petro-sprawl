// Manual import: GEM gas and oil/NGL pipeline trackers -> data/derived/gem-pipelines.json
// npm run build:curated then merges these rows with the curated corridor records into public/data/pipelines.json.
// Put the trackers' GeoJSON downloads in data/raw/gem/ (paths below), then: npm run import:gem
// Writes data/reports/import-gem.json with counts of every row skipped and why.
// Owners and parents link to their home pages from data/derived/gem-companies.json (npm run import:gem-companies).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { IMPORT_BOUNDS } from '../src/lib/config';
import { boundsOf } from '../src/lib/geo';
import type { Pipeline } from '../src/types';
import { gemRowToPipeline, type CompanyDirectory, type GemRow } from './lib/gem';
import { publishDataset, report as reportResult, sha256File } from './lib/output';
import { pipelineSchema } from './lib/schemas';

const TRACKERS = [
  {
    sourceId: 'gem-ggit-gas-pipelines-2025-11',
    path: 'data/raw/gem/GEM-GGIT-Gas-Pipelines-2025-11/GEM-GGIT-Gas-Pipelines-2025-11.geojson',
    releaseDate: '2025-11',
  },
  {
    sourceId: 'gem-goit-oil-ngl-pipelines-2026-06',
    path: 'data/raw/gem/GEM-GOIT-Oil-NGL-Pipelines-2026-06-corrected/GEM-GOIT-Oil-NGL-Pipelines-2026-07-21.geojson',
    releaseDate: '2026-06',
  },
];
// Douglas-Peucker tolerance in metres: the same detail everywhere, whatever a region's share of vertices.
const SIMPLIFY = 'interval=500';
const COMPANIES_PATH = 'data/derived/gem-companies.json';
const REPORT_PATH = 'data/reports/import-gem.json';

const [[west, south], [east, north]] = IMPORT_BOUNDS;
function inBounds(geometry: Geometry): boolean {
  const [[w, s], [e, n]] = boundsOf(geometry);
  return e >= west && w <= east && n >= south && s <= north;
}

const recordedAt = new Date().toISOString().slice(0, 10);
const pipelines: Pipeline[] = [];
const companyFile = JSON.parse(await readFile(COMPANIES_PATH, 'utf8')) as CompanyDirectory & { source: string };
const report: Record<string, unknown> = { recordedAt, simplify: SIMPLIFY, companies: companyFile.source, trackers: [] };

for (const tracker of TRACKERS) {
  const collection = JSON.parse(await readFile(tracker.path, 'utf8')) as FeatureCollection<Geometry | null, GemRow>;
  const skipped: Record<string, number> = {};
  const unresolvedCountries: Record<string, string[]> = {};
  let outsideBounds = 0;
  let missingLastUpdated = 0;
  let kept = 0;

  for (const feature of collection.features) {
    const result = gemRowToPipeline(feature.properties, feature.geometry, {
      recordedAt,
      releaseDate: tracker.releaseDate,
      sourceId: tracker.sourceId,
      companies: companyFile,
    });
    if (!result.ok) {
      skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
      continue;
    }
    if (!inBounds(result.pipeline.geometry)) {
      outsideBounds++;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(feature.properties.LastUpdated?.trim() ?? '')) missingLastUpdated++;
    for (const name of result.unresolvedCountries) (unresolvedCountries[name] ??= []).push(result.pipeline.id);
    pipelines.push(result.pipeline);
    kept++;
  }

  (report.trackers as unknown[]).push({
    sourceId: tracker.sourceId,
    file: tracker.path,
    sha256: await sha256File(tracker.path),
    rows: collection.features.length,
    kept,
    companiesLinked: countLinks(pipelines.slice(-kept)),
    outsideBounds,
    skipped,
    unresolvedCountries,
    keptWithoutLastUpdated: missingLastUpdated,
  });
}

/** Owner and parent entries, and how many link to a home page. */
function countLinks(records: Pipeline[]) {
  const companies = records.flatMap((p) => [...(p.owners ?? []), ...(p.parents ?? [])]);
  return { companies: companies.length, withHomePage: companies.filter((c) => c.url).length };
}

// Simplify all lines in one pass, then put the geometry back on each record by id.
const lines: FeatureCollection = {
  type: 'FeatureCollection',
  features: pipelines.map((p): Feature => ({ type: 'Feature', properties: { id: p.id }, geometry: p.geometry })),
};
const output = await mapshaper.applyCommands(
  `-i in.json -simplify ${SIMPLIFY} -o out.json format=geojson precision=0.001`,
  { 'in.json': lines },
);
const simplified = JSON.parse(String(output['out.json'])) as FeatureCollection<Pipeline['geometry'] | null, { id: string }>;
const geometryById = new Map(simplified.features.map((f) => [f.properties.id, f.geometry]));
for (const p of pipelines) p.geometry = geometryById.get(p.id) ?? p.geometry;

pipelines.sort((a, b) => a.name.localeCompare(b.name));
const result = await publishDataset({
  id: 'gem-pipelines',
  dataDir: 'data/derived',
  schema: pipelineSchema,
  produce: async () => ({
    records: pipelines,
    meta: {
      sourceUrl: 'https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/',
      sourceVersion: (report.trackers as { sourceId: string; sha256: string }[])
        .map((t) => `${t.sourceId} sha256:${t.sha256}`)
        .join('; '),
      license: 'CC BY 4.0, Global Energy Monitor',
    },
  }),
});
reportResult(result, 'gem-pipelines');
if (result.ok) {
  report.written = result.meta.recordCount;
  await mkdir('data/reports', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report in ${REPORT_PATH}`);
}
