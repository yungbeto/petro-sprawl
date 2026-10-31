// Manual import: the PADD regions "Where is my fuel from?" answers for, as outlines -> public/data/us-regions.json.
// Each region is its states (PADDS in src/lib/config.ts) merged into one shape.
// Source, saved in data/raw/ (gitignored): Census cartographic boundary states, 2024, 1:20m
//   https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_20m.zip (unzip into data/raw/census/)
// Run: npm run import:us-regions

import mapshaper from 'mapshaper';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import { PADDS } from '../src/lib/config';
import type { UsRegion } from '../src/types';
import { boundsOf } from '../src/lib/geo';
import { publishDataset, report, sha256File } from './lib/output';
import { usRegionSchema } from './lib/schemas';

const NAME = 'cb_2024_us_state_20m';
const SHP = `data/raw/census/${NAME}.shp`;
// Alaska and Hawaii are off the framed map (and the Aleutians cross the date line), so labels and
// framing use the contiguous part of a region.
const OFF_MAINLAND = ['Alaska', 'Hawaii'];

const paddByState = Object.fromEntries(PADDS.flatMap((p) => p.states.map((s) => [s, p.id])));
// Territories such as Puerto Rico are in no PADD and drop out.
const tag = `-each 'padd = ${JSON.stringify(paddByState)}[NAME] || null' -filter 'padd !== null'`;

async function geojson<G extends Polygon | MultiPolygon | Point>(commands: string): Promise<FeatureCollection<G, { padd: string }>> {
  const output = await mapshaper.applyCommands(`-i ${SHP} ${tag} ${commands} -o out.json format=geojson precision=0.001`);
  return JSON.parse(String(output['out.json'])) as FeatureCollection<G, { padd: string }>;
}

const result = await publishDataset({
  id: 'us-regions',
  schema: usRegionSchema,
  produce: async () => {
    const names = await mapshaper.applyCommands(`-i ${SHP} -filter-fields NAME -o out.json format=json`);
    const found = new Set((JSON.parse(String(names['out.json'])) as { NAME: string }[]).map((r) => r.NAME));
    const missing = Object.keys(paddByState).filter((s) => !found.has(s));
    if (missing.length) throw new Error(`states in PADDS but not in ${NAME}: ${missing.join(', ')}`);

    const shapes = await geojson<Polygon | MultiPolygon>('-dissolve padd');
    const mainland = `-filter '!${JSON.stringify(OFF_MAINLAND)}.includes(NAME)' -dissolve padd`;
    const contiguous = await geojson<Polygon | MultiPolygon>(mainland);
    const labels = await geojson<Point>(`${mainland} -points inner`);
    const records: UsRegion[] = PADDS.map((p) => {
      const shape = shapes.features.find((f) => f.properties.padd === p.id);
      const label = labels.features.find((f) => f.properties.padd === p.id);
      const frame = contiguous.features.find((f) => f.properties.padd === p.id);
      if (!shape || !label || !frame) throw new Error(`no outline for ${p.id}`);
      const [lon, lat] = label.geometry.coordinates;
      return { id: p.id, name: p.name, labelPoint: [lon!, lat!], frame: boundsOf(frame.geometry), geometry: shape.geometry };
    });
    return {
      records,
      meta: {
        sourceUrl: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
        sourceVersion: `Census cartographic boundary states 2024, 1:20m; ${NAME}.zip sha256:${await sha256File(`data/raw/census/${NAME}.zip`)}; states grouped by EIA's PADD lists`,
        license: 'Public domain (U.S. Census Bureau)',
      },
    };
  },
});
report(result, 'us-regions');
