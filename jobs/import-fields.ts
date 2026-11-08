// Manual import, step 2 of 2 (SPEC M13 phase 1): the extraction tracker's rows from step 1
// (data/derived/goget-rows.json, jobs/import-fields.py) -> data/derived/gem-fields.json, one record per field or
// GEM project, each tagged with the USGS province its point falls in. Fields GEM gives no point for stay off the
// map, named in the report. build:curated adds the cited claims (data/curated/field-evidence.json) and
// publishes public/data/fields.json.
// Run: npm run import:fields (both steps; after import:basins, which it joins to)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, Point } from 'geojson';
import { FIELDS } from '../src/lib/config';
import type { Basin } from '../src/types';
import { toFields, type GogetRows } from './lib/fields';
import { publishDataset, report } from './lib/output';
import { fieldSchema } from './lib/schemas';

const ROWS = 'data/derived/goget-rows.json';
const REPORT_PATH = 'data/reports/import-fields.json';
const recordedAt = new Date().toISOString().slice(0, 10);

const result = await publishDataset({
  id: 'gem-fields',
  dataDir: 'data/derived',
  schema: fieldSchema,
  produce: async () => {
    const rows = JSON.parse(await readFile(ROWS, 'utf8')) as GogetRows;
    const imported = toFields(rows, { recordedAt });
    const basins = JSON.parse(await readFile('public/data/basins.json', 'utf8')) as Basin[];
    const provinces: FeatureCollection = {
      type: 'FeatureCollection',
      features: basins.map((b) => ({ type: 'Feature', properties: { province: b.id }, geometry: b.geometry })),
    };
    const points: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: imported.fields.map((f) => ({ type: 'Feature', properties: { id: f.id }, geometry: { type: 'Point', coordinates: f.point } })),
    };
    const output = await mapshaper.applyCommands('-i points.json -join provinces.json fields=province -o out.json format=geojson', {
      'points.json': points,
      'provinces.json': provinces,
    });
    const joined = JSON.parse(String(output['out.json'])) as FeatureCollection<Point, { id: string; province?: string | null }>;
    const provinceOf = new Map(joined.features.map((f) => [f.properties.id, f.properties.province ?? undefined]));
    const fields = imported.fields.map((f) => {
      const provinceId = provinceOf.get(f.id);
      return provinceId ? { ...f, provinceId } : f;
    });
    await mkdir('data/reports', { recursive: true });
    await writeFile(
      REPORT_PATH,
      JSON.stringify(
        {
          recordedAt,
          source: rows.source,
          sha256: rows.sha256,
          rows: { fields: rows.fields.length, projects: rows.projects.length },
          published: fields.length,
          projects: fields.filter((f) => f.level === 'project').length,
          withOutput: fields.filter((f) => f.output.length).length,
          inProvince: fields.filter((f) => f.provinceId).length,
          skipped: imported.skipped,
          // GEM gives these no point: off the map until it does.
          unplaced: imported.unplaced,
          unresolvedCountries: imported.unresolvedCountries,
          duplicateFigures: imported.duplicateFigures,
        },
        null,
        2,
      ) + '\n',
    );
    return {
      records: fields,
      meta: {
        sourceUrl: FIELDS.sourcePage,
        sourceVersion: `${rows.source} sha256:${rows.sha256}; provinces joined from basins.json`,
        license: 'CC BY 4.0, Global Energy Monitor',
      },
    };
  },
});
report(result, 'gem-fields');
console.log(`report in ${REPORT_PATH}; run build:curated to publish public/data/fields.json`);
