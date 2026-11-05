// Folds the drafts still waiting on the open review pull request into this run's drafts file, so the
// workflow can rebuild that one pull request from main (jobs/lib/review.ts decides what carries over).
// Run: npm run merge:review-drafts -- news <pending.json>   (into data/reports/disruption-drafts.json)
//      npm run merge:review-drafts -- claims <pending.json> (into data/reports/claim-drafts.json)
// A missing pending file means no pull request is open: the run's drafts stand alone.

import { readFile, writeFile } from 'node:fs/promises';
import type { Disruption } from '../src/types';
import { citedUrls, type CuratedRecord } from './lib/claims';
import type { DisruptionDraftRecord } from './lib/news';
import { reviewClaimDrafts, reviewDisruptionDrafts, type ClaimDraftRecord } from './lib/review';

const [kind, pendingFile] = process.argv.slice(2);
if ((kind !== 'news' && kind !== 'claims') || !pendingFile) throw new Error('usage: merge-review-drafts <news|claims> <pending.json>');

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

if (kind === 'news') {
  const file = 'data/reports/disruption-drafts.json';
  const pending = await readJson<DisruptionDraftRecord[]>(pendingFile, []);
  const fresh = await readJson<DisruptionDraftRecord[]>(file, []);
  const main = JSON.parse(await readFile('data/curated/disruptions.json', 'utf8')) as Disruption[];
  const drafts = reviewDisruptionDrafts(pending, fresh, main);
  await writeFile(file, json(drafts));
  console.log(`disruption drafts for review: ${drafts.length} (${pending.length} waiting, ${fresh.length} new)`);
} else {
  const file = 'data/reports/claim-drafts.json';
  const files = { pipeline: 'data/curated/pipelines-evidence.json', lng: 'data/curated/lng-evidence.json', terminal: 'data/curated/oil-terminals.json' };
  const texts = await Promise.all(Object.values(files).map((f) => readFile(f, 'utf8')));
  const refs = new Set(
    Object.keys(files).flatMap((k, i) => (JSON.parse(texts[i]!) as CuratedRecord[]).map((r) => `${k}/${r.id}`)),
  );
  const cited = citedUrls([...texts, await readFile('data/curated/disruptions.json', 'utf8')]);
  const pending = await readJson<ClaimDraftRecord[]>(pendingFile, []);
  const fresh = await readJson<ClaimDraftRecord[]>(file, []);
  const drafts = reviewClaimDrafts(pending, fresh, { cited, refs });
  await writeFile(file, json(drafts));
  console.log(`claim drafts for review: ${drafts.length} (${pending.length} waiting, ${fresh.length} new)`);
}
