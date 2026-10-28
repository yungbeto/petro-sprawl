// Publishes hand-curated files from data/curated/ to public/data/, validated.
// Run after editing a curated file: npm run build:curated

import { readFile } from 'node:fs/promises';
import { publishDataset, report } from './lib/output';
import { disruptionSchema } from './lib/schemas';

const result = await publishDataset({
  id: 'disruptions',
  schema: disruptionSchema,
  produce: async () => ({
    records: JSON.parse(await readFile('data/curated/disruptions.json', 'utf8')) as unknown[],
    meta: {
      sourceUrl: 'data/curated/disruptions.json',
      sourceVersion: 'Hand-curated; every record cites its sources',
      license: 'Ours; linked sources keep their own terms',
    },
  }),
});
report(result, 'disruptions');
