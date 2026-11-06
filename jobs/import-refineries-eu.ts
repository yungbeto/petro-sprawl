// Manual import, step 2 of 2 (SPEC M11 phase 2): the EEA register's refineries from step 1
// (data/derived/eea-refineries.json, jobs/import-refineries-eu.py) -> data/derived/refineries-eu.json, at the
// points the register gives. build:curated publishes them with the US refineries and the cited claims.
// Run: npm run import:refineries-eu (both steps)

import { readFile } from 'node:fs/promises';
import { REFINERIES } from '../src/lib/config';
import { toEeaRefineries, type EeaRefinery } from './lib/refineries';
import { publishDataset, report } from './lib/output';
import { refinerySchema } from './lib/schemas';

const today = new Date().toISOString().slice(0, 10);
const result = await publishDataset({
  id: 'refineries-eu',
  dataDir: 'data/derived',
  schema: refinerySchema,
  produce: async () => {
    const eea = JSON.parse(await readFile('data/derived/eea-refineries.json', 'utf8')) as { source: string; refineries: EeaRefinery[] };
    return {
      records: toEeaRefineries(eea.refineries, { today }),
      meta: {
        sourceUrl: REFINERIES.eeaPage,
        sourceVersion: eea.source,
        license: 'CC BY 4.0, European Environment Agency',
      },
    };
  },
});
report(result, 'refineries-eu');
console.log('run build:curated to publish public/data/refineries.json');
