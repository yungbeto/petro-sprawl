// Manual import: USGS World Petroleum Assessment 2000 provinces -> public/data/basins.json
// Source: https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3
// Put the unzipped WEP_PRVG shapefile and the original zip in data/raw/usgs/, then: npm run import:basins

import mapshaper from 'mapshaper';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { THEATER_BOUNDS } from '../src/lib/config';
import type { Basin } from '../src/types';
import { toBasin, type UsgsProvinceProps } from './lib/basins';
import { publishDataset, report, sha256File } from './lib/output';
import { basinSchema } from './lib/schemas';

const RAW_DIR = 'data/raw/usgs';
const SIMPLIFY = '6%';

const [[west, south], [east, north]] = THEATER_BOUNDS;
// Keep priority and boutique provinces whose bounds touch the theater (no clipping, so outlines stay whole).
const filter = [
  '(TYPE=="p" || TYPE=="b")',
  `this.bounds[2] >= ${west}`,
  `this.bounds[0] <= ${east}`,
  `this.bounds[3] >= ${south}`,
  `this.bounds[1] <= ${north}`,
].join(' && ');

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
    const basins = collection.features
      .map((f) => toBasin(f.properties, f.geometry))
      .filter((b): b is Basin => b !== null)
      .sort((a, b) => a.code - b.code);
    const zipHash = await sha256File(`${RAW_DIR}/WEP_PRVG.zip`);
    return {
      records: basins,
      meta: {
        sourceUrl: 'https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3',
        sourceVersion: `World Petroleum Assessment 2000 (DDS-60); WEP_PRVG.zip sha256:${zipHash}; simplified ${SIMPLIFY}`,
        license: 'Public domain (USGS)',
      },
    };
  },
});
report(result, 'basins');
