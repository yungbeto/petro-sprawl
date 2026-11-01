// Manual import: Natural Earth 1:50m admin-0 countries, worldwide (gas storage reaches past Europe, SPEC M10) -> public/data/countries.json,
// and every country's World Bank region -> public/data/country-regions.json (for grouping pipelines).
// Unzip ne_50m_admin_0_countries.zip (with the zip) into data/raw/naturalearth/, then: npm run import:countries
// https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip

import { readFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Country, CountryRegion } from '../src/types';
import { publishDataset, report, sha256File } from './lib/output';
import { countryRegionSchema, countrySchema } from './lib/schemas';

const NE_DIR = 'data/raw/naturalearth';
const NE_NAME = 'ne_50m_admin_0_countries';
const SIMPLIFY = '15%';

const result = await publishDataset({
  id: 'countries',
  schema: countrySchema,
  produce: async () => {
    const output = await mapshaper.applyCommands(
      [
        `-i ${NE_DIR}/${NE_NAME}.shp`,
        `-simplify ${SIMPLIFY} keep-shapes`,
        '-filter-fields ISO_A2_EH,NAME',
        '-o out.json format=geojson precision=0.001',
      ].join(' '),
    );
    const collection = JSON.parse(String(output['out.json'])) as FeatureCollection<
      Polygon | MultiPolygon,
      { ISO_A2_EH: string; NAME: string }
    >;
    // Natural Earth has no ISO code for a few disputed areas (-99); they aren't storage countries.
    const countries: Country[] = collection.features
      .filter((f) => /^[A-Z]{2}$/.test(f.properties.ISO_A2_EH))
      .map((f) => ({ id: f.properties.ISO_A2_EH, name: f.properties.NAME, geometry: f.geometry }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const version = (await readFile(`${NE_DIR}/${NE_NAME}.VERSION.txt`, 'utf8')).trim();
    return {
      records: countries,
      meta: {
        sourceUrl: 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/',
        sourceVersion: `Natural Earth ${version} 1:50m admin-0; ${NE_NAME}.zip sha256:${await sha256File(`${NE_DIR}/${NE_NAME}.zip`)}; simplified ${SIMPLIFY}`,
        license: 'Public domain (Natural Earth)',
      },
    };
  },
});
report(result, 'countries');

const regions = await publishDataset({
  id: 'country-regions',
  schema: countryRegionSchema,
  produce: async () => {
    const output = await mapshaper.applyCommands(
      [`-i ${NE_DIR}/${NE_NAME}.shp`, '-filter-fields ISO_A2_EH,NAME,REGION_WB', '-o out.json format=json'].join(' '),
    );
    const rows = JSON.parse(String(output['out.json'])) as { ISO_A2_EH: string; NAME: string; REGION_WB: string }[];
    const records: CountryRegion[] = rows
      .filter((r) => /^[A-Z]{2}$/.test(r.ISO_A2_EH) && r.REGION_WB && r.REGION_WB !== 'Antarctica')
      .map((r) => ({ id: r.ISO_A2_EH, name: r.NAME, region: r.REGION_WB }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const version = (await readFile(`${NE_DIR}/${NE_NAME}.VERSION.txt`, 'utf8')).trim();
    return {
      records,
      meta: {
        sourceUrl: 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/',
        sourceVersion: `Natural Earth ${version} 1:50m admin-0, REGION_WB field; ${NE_NAME}.zip sha256:${await sha256File(`${NE_DIR}/${NE_NAME}.zip`)}`,
        license: 'Public domain (Natural Earth)',
      },
    };
  },
});
report(regions, 'country-regions');
