import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DatasetMeta } from '../../src/types';

export const DATA_DIR = join(import.meta.dirname, '../../public/data');

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value)}\n`);
  await rename(tmp, path);
}

/** Writes public/data/<id>.json and its DatasetMeta. Refuses to publish an empty dataset. */
export async function writeDataset(
  id: string,
  records: unknown[],
  meta: Omit<DatasetMeta, 'id' | 'fetchedAt' | 'recordCount'>,
): Promise<DatasetMeta> {
  if (records.length === 0) throw new Error(`${id}: refusing to write an empty dataset`);
  const full: DatasetMeta = { id, fetchedAt: new Date().toISOString(), recordCount: records.length, ...meta };
  await writeJsonAtomic(join(DATA_DIR, `${id}.json`), records);
  await writeJsonAtomic(join(DATA_DIR, 'meta', `${id}.json`), full);
  return full;
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
