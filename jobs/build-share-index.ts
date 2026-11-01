// Build step: every page's share card (src/lib/share.ts), from the published data, -> dist/share/<kind>.json,
// read by the link preview functions (server/page.ts, server/og.tsx). Runs after vite build, so each deploy's cards
// match its data. Run: npm run build (or npm run build:share after a vite build)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatasetMeta } from '../src/types';
import { assembleDatasets, DATASET_IDS, type DatasetId } from '../src/lib/data';
import { shareCards } from '../src/lib/share';

const DATA = 'public/data';
const OUT = 'dist/share';

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

const records = new Map<DatasetId, unknown[]>();
const meta: DatasetMeta[] = [];
for (const id of DATASET_IDS) {
  records.set(id, (await readJson<unknown[]>(join(DATA, `${id}.json`))) ?? []);
  const m = await readJson<DatasetMeta>(join(DATA, 'meta', `${id}.json`));
  if (m) meta.push(m);
}
const missing = DATASET_IDS.filter((id) => !records.get(id)?.length);
if (missing.length) console.warn(`share: no records for ${missing.join(', ')}`);

const cards = shareCards(assembleDatasets((id) => records.get(id) ?? [], meta));
await mkdir(OUT, { recursive: true });
for (const [file, index] of Object.entries(cards)) {
  const body = JSON.stringify(index);
  await writeFile(join(OUT, `${file}.json`), body);
  console.log(`share: ${Object.keys(index).length} cards -> ${OUT}/${file}.json (${Math.round(body.length / 1024)} KB)`);
}
