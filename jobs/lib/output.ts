import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { z } from 'zod';
import type { DatasetMeta } from '../../src/types';

export const DATA_DIR = join(import.meta.dirname, '../../public/data');

type StaticMeta = Pick<DatasetMeta, 'sourceUrl' | 'sourceVersion' | 'license' | 'dataThrough'>;

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value)}\n`);
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Checks records before they may replace a published file. Throws with a readable reason. */
export function validateRecords<T>(id: string, records: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(records) || records.length === 0) throw new Error(`${id}: no records`);
  return records.map((record, i) => {
    const result = schema.safeParse(record);
    if (!result.success) throw new Error(`${id}: record ${i} is invalid: ${result.error.issues[0]?.message ?? 'unknown'}`);
    return result.data;
  });
}

/** Meta after a successful run. */
export function successMeta(id: string, count: number, meta: StaticMeta, at: string): DatasetMeta {
  return { id, fetchedAt: at, recordCount: count, ...meta, lastAttempt: { at, ok: true } };
}

/**
 * Meta after a failed run: everything about the last good file stays, only lastAttempt changes.
 * Returns null when there has never been a good file (nothing to describe).
 */
export function failureMeta(previous: DatasetMeta | null, error: string, at: string): DatasetMeta | null {
  if (!previous) return null;
  return { ...previous, lastAttempt: { at, ok: false, error: error.slice(0, 300) } };
}

interface PublishOptions<T> {
  id: string;
  schema: z.ZodType<T>;
  /** Fetches and transforms. Anything it throws counts as a failed run. */
  produce: () => Promise<{ records: unknown[]; meta: StaticMeta }>;
  dataDir?: string;
  now?: () => Date;
}

/**
 * Runs a job and publishes public/data/<id>.json plus meta/<id>.json.
 * On any failure the previous data file is left untouched and the failure is recorded in meta.
 */
export async function publishDataset<T>({
  id,
  schema,
  produce,
  dataDir = DATA_DIR,
  now = () => new Date(),
}: PublishOptions<T>): Promise<{ ok: true; meta: DatasetMeta } | { ok: false; error: string }> {
  const dataPath = join(dataDir, `${id}.json`);
  const metaPath = join(dataDir, 'meta', `${id}.json`);
  const at = now().toISOString();
  try {
    const { records, meta } = await produce();
    const valid = validateRecords(id, records, schema);
    const full = successMeta(id, valid.length, meta, at);
    await writeJsonAtomic(dataPath, valid);
    await writeJsonAtomic(metaPath, full);
    return { ok: true, meta: full };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const meta = failureMeta(await readJson<DatasetMeta>(metaPath), error, at);
    if (meta) await writeJsonAtomic(metaPath, meta);
    return { ok: false, error };
  }
}

/** For job entry points: logs the outcome and sets a failing exit code so CI shows it. */
export function report(result: Awaited<ReturnType<typeof publishDataset>>, id: string): void {
  if (result.ok) {
    console.log(`${id}: wrote ${result.meta.recordCount}${result.meta.dataThrough ? `, data through ${result.meta.dataThrough}` : ''}`);
  } else {
    console.error(`${id}: FAILED, previous file kept. ${result.error}`);
    process.exitCode = 1;
  }
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
