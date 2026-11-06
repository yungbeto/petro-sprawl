// Adds the drafts that need review (data/reports/claim-drafts.json, from refresh:claims) to the curated
// files, for the pull request the claims workflow opens. Run build:curated afterwards.
// Run: npm run apply:claim-drafts

import { readFile, writeFile } from 'node:fs/promises';
import type { Evidence } from '../src/types';
import { addEvidence, type CuratedRecord } from './lib/claims';

const FILES = {
  pipeline: 'data/curated/pipelines-evidence.json',
  lng: 'data/curated/lng-evidence.json',
  terminal: 'data/curated/oil-terminals.json',
  refinery: 'data/curated/refinery-evidence.json',
} as const;

const drafts = JSON.parse(await readFile('data/reports/claim-drafts.json', 'utf8')) as { ref: string; evidence: Evidence }[];
for (const [kind, file] of Object.entries(FILES)) {
  let records = JSON.parse(await readFile(file, 'utf8')) as CuratedRecord[];
  for (const d of drafts.filter((d) => d.ref.startsWith(`${kind}/`))) records = addEvidence(records, d.ref.slice(kind.length + 1), d.evidence);
  await writeFile(file, `${JSON.stringify(records, null, 2)}\n`);
}
console.log(`applied ${drafts.length} drafts`);
