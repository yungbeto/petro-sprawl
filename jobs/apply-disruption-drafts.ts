// Adds the disruption drafts that need review (data/reports/disruption-drafts.json, from scan:news) to
// data/curated/disruptions.json, for the pull request the news workflow opens. Merging the pull request is
// the review, so these sources carry no "unreviewed" mark. Run build:curated afterwards.
// Run: npm run apply:disruption-drafts

import { readFile, writeFile } from 'node:fs/promises';
import type { Disruption } from '../src/types';
import { addSource, type DisruptionDraftRecord } from './lib/news';

const FILE = 'data/curated/disruptions.json';
const drafts = JSON.parse(await readFile('data/reports/disruption-drafts.json', 'utf8')) as DisruptionDraftRecord[];
let disruptions = JSON.parse(await readFile(FILE, 'utf8')) as Disruption[];
for (const d of drafts) {
  if (d.action === 'new_disruption' && d.disruption) {
    disruptions = [...disruptions, d.disruption];
    continue;
  }
  if (!d.disruptionId) throw new Error(`draft for ${d.ref} names no disruption`);
  disruptions = addSource(disruptions, d.disruptionId, d.source).map((x) =>
    x.id === d.disruptionId ? { ...x, ...(d.endedAt ? { endedAt: d.endedAt } : {}), ...(d.cause ? { cause: d.cause } : {}) } : x,
  );
}
await writeFile(FILE, `${JSON.stringify(disruptions, null, 2)}\n`);
console.log(`applied ${drafts.length} disruption drafts`);
