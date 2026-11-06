// Manual import, step 2 of 2 (SPEC M11 phase 1): the EIA capacities from step 1
// (data/derived/eia-refineries.json, jobs/import-refineries-us.py) placed at the points of EIA's 2021 refinery
// shapefile (data/raw/eia/refineries/), -> data/derived/refineries-us.json. A refinery without a point from the
// shapefile is left off the map and named in the report; points are never typed in. build:curated adds the
// cited claims (data/curated/refinery-evidence.json) and publishes public/data/refineries.json.
// Run: npm run import:refineries-us (both steps)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, Point } from 'geojson';
import { placeRefineries, toRefineries, type EiaRefinery, type EiaRefineryPoint } from './lib/refineries';
import { publishDataset, report, sha256File } from './lib/output';
import { refinerySchema } from './lib/schemas';

const SHAPEFILE = 'data/raw/eia/refineries/Petroleum_Refineries_US_2021';
const REPORT_PATH = 'data/reports/import-refineries-us.json';
const today = new Date().toISOString().slice(0, 10);

const result = await publishDataset({
  id: 'refineries-us',
  dataDir: 'data/derived',
  schema: refinerySchema,
  produce: async () => {
    const eia = JSON.parse(await readFile('data/derived/eia-refineries.json', 'utf8')) as { source: string; asOf: string; refineries: EiaRefinery[] };
    const output = await mapshaper.applyCommands(`-i ${SHAPEFILE}.shp -o out.json format=geojson`);
    const shapes = JSON.parse(String(output['out.json'])) as FeatureCollection<Point, { Company: string; Site: string; State: string }>;
    const points: EiaRefineryPoint[] = shapes.features.map((f) => ({
      company: f.properties.Company,
      site: f.properties.Site,
      state: f.properties.State,
      point: [Number(f.geometry.coordinates[0]!.toFixed(5)), Number(f.geometry.coordinates[1]!.toFixed(5))],
    }));
    const { placed, unplaced } = placeRefineries(eia.refineries, points);
    const records = toRefineries(placed, { asOf: eia.asOf, today, all: eia.refineries });
    const used = new Set(placed.map((p) => p.point));
    await mkdir('data/reports', { recursive: true });
    await writeFile(
      REPORT_PATH,
      JSON.stringify(
        {
          recordedAt: today,
          refineries: eia.refineries.length,
          placed: placed.length,
          // EIA lists these in 2026 but the 2021 shapefile has no point for them: off the map until a dataset places them.
          unplaced: unplaced.map((r) => `${r.company} / ${r.site} / ${r.state} (${r.operable.toLocaleString('en-US')} b/cd)`),
          // A shared site's last refinery took its last point; the 2021 company is kept here to check by eye.
          byElimination: placed.filter((p) => p.by === 'elimination').map((p) => `${p.refinery.company} at ${p.refinery.site}: 2021 point of ${p.point.company}`),
          // 2021 points no 2026 refinery took: closed or converted since, or renamed past matching.
          pointsUnused: points.filter((p) => !used.has(p)).map((p) => `${p.company} / ${p.site} / ${p.state}`),
        },
        null,
        2,
      ) + '\n',
    );
    const shpHash = await sha256File(`${SHAPEFILE}.shp`);
    return {
      records,
      meta: {
        sourceUrl: 'https://www.eia.gov/petroleum/refinerycapacity/',
        sourceVersion: `${eia.source}; locations from EIA Petroleum_Refineries_US_2021.shp sha256:${shpHash}`,
        license: 'Public domain (U.S. Energy Information Administration)',
      },
    };
  },
});
report(result, 'refineries-us');
console.log('run build:curated to publish public/data/refineries.json');
