// Manual import: lookup tables for "Where is my oil from?" (SPEC M6) -> public/data/us-lookup.json.
// Sources, saved in data/raw/ (gitignored):
//   data/raw/census/tab20_zcta520_county20_natl.txt  Census 2020 ZCTA-to-county relationship file
//     https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
//   data/raw/census/sub-est2025.csv  Census city and town population estimates, vintage 2025
//     https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv
//   data/raw/eia/refineries/Petroleum_Refineries_US_2021.shp  EIA refinery locations, as of 1 January 2021
//     https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip (unzip into data/raw/eia/refineries/)
//   data/raw/naturalearth/ne_50m_admin_0_countries.shp  Natural Earth countries (as for import:countries)
// Run: npm run import:us-lookup

import { readFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, Point } from 'geojson';
import { PADDS } from '../src/lib/config';
import type { UsLookup } from '../src/types';
import { publishDataset, report, sha256File } from './lib/output';
import { usLookupSchema } from './lib/schemas';
import { largestCities, paddHubs, zctaStates, zipRanges } from './lib/us-lookup';

const ZCTA = 'data/raw/census/tab20_zcta520_county20_natl.txt';
const POP = 'data/raw/census/sub-est2025.csv';
const REFINERIES = 'data/raw/eia/refineries/Petroleum_Refineries_US_2021.shp';
const NE = 'data/raw/naturalearth/ne_50m_admin_0_countries.shp';
const CITIES = 300;

async function geojson<P>(command: string): Promise<FeatureCollection<Point | null, P>> {
  const output = await mapshaper.applyCommands(`${command} -o out.json format=geojson`);
  return JSON.parse(String(output['out.json'])) as FeatureCollection<Point | null, P>;
}

const result = await publishDataset({
  id: 'us-lookup',
  schema: usLookupSchema,
  produce: async () => {
    const pop = await readFile(POP, 'utf8');
    // State FIPS codes and names from the population file's state rows (SUMLEV 040).
    const stateByFips = new Map(
      pop
        .split(/\r?\n/)
        .map((l) => l.split(','))
        .filter((f) => f[0] === '040')
        .map((f) => [f[1]!, f[8]!] as const),
    );
    const known = new Set<string>(PADDS.flatMap((p) => [...p.states]));
    const states = [...stateByFips.values()].filter((s) => known.has(s)).sort();
    const missing = [...known].filter((s) => !states.includes(s));
    if (missing.length) throw new Error(`states in PADDS but not in the population file: ${missing.join(', ')}`);

    const pairs = zctaStates(await readFile(ZCTA, 'utf8'), stateByFips).filter(([, s]) => known.has(s));
    const cities = largestCities(pop, CITIES, 'POPESTIMATE2025').filter((c) => known.has(c.state));

    const refineries = await geojson<{ PADD: number; State: string; AD_Mbpd: number }>(`-i ${REFINERIES} -proj wgs84`);
    const hubs = paddHubs(
      refineries.features.flatMap((f) =>
        f.geometry
          ? [{ padd: f.properties.PADD, state: f.properties.State, capacity: f.properties.AD_Mbpd, lon: f.geometry.coordinates[0]!, lat: f.geometry.coordinates[1]! }]
          : [],
      ),
    );

    const countries = await geojson<{ ADM0_A3: string; LABEL_X: number; LABEL_Y: number }>(
      `-i ${NE} -filter-fields ADM0_A3,LABEL_X,LABEL_Y -points centroid`,
    );
    const countryPoints = Object.fromEntries(
      countries.features
        .filter((f) => /^[A-Z]{3}$/.test(f.properties.ADM0_A3))
        .map((f) => [f.properties.ADM0_A3, [Math.round(f.properties.LABEL_X * 1000) / 1000, Math.round(f.properties.LABEL_Y * 1000) / 1000] as [number, number]]),
    );

    const lookup: UsLookup = { states, zipRanges: zipRanges(pairs, states), cities, hubs, countryPoints };
    return {
      records: [lookup],
      meta: {
        sourceUrl: 'https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html',
        sourceVersion: [
          `Census 2020 ZCTA-county relationship file sha256:${await sha256File(ZCTA)} (${pairs.length} ZCTAs)`,
          `Census population estimates vintage 2025 sha256:${await sha256File(POP)} (largest ${CITIES} places)`,
          `EIA refinery locations as of 2021-01-01 sha256:${await sha256File('data/raw/eia/Petroleum_Refineries_US_EIA.zip')}`,
          'Natural Earth 1:50m admin-0 label points',
        ].join('; '),
        license: 'Public domain (U.S. Census Bureau, EIA, Natural Earth)',
      },
    };
  },
});
report(result, 'us-lookup');
