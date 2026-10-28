// Chokepoint locations from IMF PortWatch, joined with EIA reference volumes from src/lib/config.ts.
// Run: npm run import:chokepoints

import { CHOKEPOINTS, EIA_CHOKEPOINTS_SOURCE, EIA_REFERENCE_YEAR } from '../src/lib/config';
import { buildChokepoints, portwatchResponseSchema } from './lib/chokepoints';
import { writeDataset } from './lib/output';

const PORTWATCH_URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';

const params = new URLSearchParams({
  where: '1=1',
  outFields: 'portid,portname,lat,lon',
  returnGeometry: 'false',
  f: 'json',
});
const response = await fetch(`${PORTWATCH_URL}?${params}`);
if (!response.ok) throw new Error(`PortWatch responded ${response.status}`);
const parsed = portwatchResponseSchema.parse(await response.json());

const chokepoints = buildChokepoints(
  CHOKEPOINTS,
  parsed.features.map((f) => f.attributes),
);
const meta = await writeDataset('chokepoints', chokepoints, {
  sourceUrl: PORTWATCH_URL.replace(/\/query$/, ''),
  sourceVersion: `Locations: IMF PortWatch chokepoints database. Volumes: EIA ${EIA_REFERENCE_YEAR}, ${EIA_CHOKEPOINTS_SOURCE}`,
  license: 'IMF PortWatch terms (attribution); EIA public domain',
});
console.log(`chokepoints: wrote ${meta.recordCount}`);
