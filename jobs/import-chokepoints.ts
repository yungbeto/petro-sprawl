// Chokepoint locations from IMF PortWatch, joined with EIA reference volumes from src/lib/config.ts.
// Run: npm run import:chokepoints

import { CHOKEPOINTS, EIA_CHOKEPOINTS_SOURCE, EIA_REFERENCE_YEAR } from '../src/lib/config';
import { buildChokepoints, portwatchResponseSchema } from './lib/chokepoints';
import { publishDataset, report } from './lib/output';
import { chokepointSchema } from './lib/schemas';

const PORTWATCH_URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';

const params = new URLSearchParams({
  where: '1=1',
  outFields: 'portid,portname,lat,lon',
  returnGeometry: 'false',
  f: 'json',
});
const result = await publishDataset({
  id: 'chokepoints',
  schema: chokepointSchema,
  produce: async () => {
    const response = await fetch(`${PORTWATCH_URL}?${params}`);
    if (!response.ok) throw new Error(`PortWatch responded ${response.status}`);
    const parsed = portwatchResponseSchema.parse(await response.json());
    return {
      records: buildChokepoints(
        CHOKEPOINTS,
        parsed.features.map((f) => f.attributes),
      ),
      meta: {
        sourceUrl: PORTWATCH_URL.replace(/\/query$/, ''),
        sourceVersion: `Locations: IMF PortWatch chokepoints database. Volumes: EIA ${EIA_REFERENCE_YEAR}, ${EIA_CHOKEPOINTS_SOURCE}`,
        license: 'IMF PortWatch terms (attribution); EIA public domain',
      },
    };
  },
});
report(result, 'chokepoints');
