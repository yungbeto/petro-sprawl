// Manual import: USGS World Petroleum Assessment 2000 provinces -> public/data/basins.json
// Source: https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3
// Put the unzipped WEP_PRVG shapefile and the original zip in data/raw/usgs/, then: npm run import:basins
// Countries come from Natural Earth 1:50m admin-0 (public domain), unzipped with its zip in data/raw/naturalearth/:
// https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { BASIN_COUNTRY_OVERLAP, IMPORT_BOUNDS } from '../src/lib/config';
import type { Basin } from '../src/types';
import { mergeBasinCountries, toBasin, type BasinCountryMatch, type UsgsProvinceProps } from './lib/basins';
import { publishDataset, report, sha256File } from './lib/output';
import { basinSchema } from './lib/schemas';

const RAW_DIR = 'data/raw/usgs';
const NE_DIR = 'data/raw/naturalearth';
const NE_NAME = 'ne_50m_admin_0_countries';
const REPORT_PATH = 'data/reports/import-basins.json';
const SIMPLIFY = '6%';

const [[west, south], [east, north]] = IMPORT_BOUNDS;
// Keep priority and boutique provinces whose bounds touch the import bounds (no clipping, so outlines stay whole).
const filter = [
  '(TYPE=="p" || TYPE=="b")',
  `this.bounds[2] >= ${west}`,
  `this.bounds[0] <= ${east}`,
  `this.bounds[3] >= ${south}`,
  `this.bounds[1] <= ${north}`,
].join(' && ');

/** Matches each basin to the countries its unsimplified outline overlaps, by both overlap rules. */
async function countryMatches(): Promise<BasinCountryMatch[]> {
  const output = await mapshaper.applyCommands(
    [
      `-i ${NE_DIR}/${NE_NAME}.shp name=countries`,
      `-each 'key=ISO_A2_EH + "|" + NAME'`,
      `-i ${RAW_DIR}/WEP_PRVG/WEP_PRVG.SHP name=basins`,
      `-filter '${filter}'`,
      `-join source=countries calc='keys=collect(key)' min-overlap-area=${BASIN_COUNTRY_OVERLAP.minAreaM2}`,
      `-join target=countries source=basins calc='codes=collect(CODE)' min-overlap-pct=${BASIN_COUNTRY_OVERLAP.minCountryShare}`,
      '-o target=basins basins.json format=json',
      '-o target=countries countries.json format=json',
    ].join(' '),
  );
  const basins = JSON.parse(String(output['basins.json'])) as { CODE: number; keys?: string[] | null }[];
  const countries = JSON.parse(String(output['countries.json'])) as { key: string; codes?: number[] | null }[];
  const parse = (code: number, key: string): BasinCountryMatch => {
    const split = key.indexOf('|');
    return { code, iso: key.slice(0, split), name: key.slice(split + 1) };
  };
  return [
    ...basins.flatMap((b) => (b.keys ?? []).map((key) => parse(b.CODE, key))),
    ...countries.flatMap((c) => (c.codes ?? []).map((code) => parse(code, c.key))),
  ];
}

const result = await publishDataset({
  id: 'basins',
  schema: basinSchema,
  produce: async () => {
    const output = await mapshaper.applyCommands(
      [
        `-i ${RAW_DIR}/WEP_PRVG/WEP_PRVG.SHP`,
        `-filter '${filter}'`,
        `-simplify ${SIMPLIFY} keep-shapes`,
        `-each 'lx=this.innerX, ly=this.innerY'`,
        '-filter-fields CODE,NAME,TYPE,O_G,lx,ly',
        '-o out.json format=geojson precision=0.001',
      ].join(' '),
    );
    const collection = JSON.parse(String(output['out.json'])) as FeatureCollection<
      Polygon | MultiPolygon,
      UsgsProvinceProps
    >;
    const { countries, skipped } = mergeBasinCountries(await countryMatches());
    const basins = collection.features
      .map((f) => toBasin(f.properties, f.geometry, countries.get(f.properties.CODE)))
      .filter((b): b is Basin => b !== null)
      .sort((a, b) => a.code - b.code);
    const zipHash = await sha256File(`${RAW_DIR}/WEP_PRVG.zip`);
    const neHash = await sha256File(`${NE_DIR}/${NE_NAME}.zip`);
    const neVersion = (await readFile(`${NE_DIR}/${NE_NAME}.VERSION.txt`, 'utf8')).trim();
    await mkdir('data/reports', { recursive: true });
    await writeFile(
      REPORT_PATH,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString().slice(0, 10),
          countriesWithoutIsoCode: skipped,
          basinsWithoutCountries: basins.filter((b) => !b.countries.length).map((b) => b.name),
        },
        null,
        2,
      ) + '\n',
    );
    return {
      records: basins,
      meta: {
        sourceUrl: 'https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3',
        sourceVersion: `World Petroleum Assessment 2000 (DDS-60); WEP_PRVG.zip sha256:${zipHash}; simplified ${SIMPLIFY}; countries from Natural Earth ${neVersion} 1:50m admin-0, sha256:${neHash}`,
        license: 'Public domain (USGS; Natural Earth)',
      },
    };
  },
});
report(result, 'basins');
