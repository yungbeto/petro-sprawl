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

/** Meta after a successful run. A warning (part of the data carried over) still counts as a failed attempt. */
export function successMeta(id: string, count: number, meta: StaticMeta, at: string, warning?: string): DatasetMeta {
  const lastAttempt = warning ? { at, ok: false, error: warning.slice(0, 300) } : { at, ok: true };
  return { id, fetchedAt: at, recordCount: count, ...meta, lastAttempt };
}

/** The records in a published file, or none when there isn't one yet. */
export async function readPublished<T>(id: string, dataDir = DATA_DIR): Promise<T[]> {
  return (await readJson<T[]>(join(dataDir, `${id}.json`))) ?? [];
}

/**
 * Fetches each item in turn, tries the failures once more after the rest, and for any still failing
 * keeps that item's records from the previous file. Throws when no item could be fetched, so the
 * whole previous file stays. The warning names what was carried over (or is missing).
 */
export async function eachWithFallback<I, R>(
  items: readonly I[],
  { name, fetch, previous }: { name: (item: I) => string; fetch: (item: I) => Promise<R[]>; previous: (item: I) => R[] },
): Promise<{ records: R[]; warning?: string }> {
  const results = new Map<I, R[]>();
  const errors = new Map<I, string>();
  const attempt = async (item: I) => {
    try {
      results.set(item, await fetch(item));
      errors.delete(item);
    } catch (err) {
      errors.set(item, err instanceof Error ? err.message : String(err));
    }
  };
  for (const item of items) await attempt(item);
  for (const item of [...errors.keys()]) await attempt(item);
  if (results.size === 0) throw new Error([...errors.values()][0] ?? 'nothing to fetch');

  const records = items.flatMap((item) => results.get(item) ?? previous(item));
  if (errors.size === 0) return { records };
  const failed = [...errors].map(([item, error]) => `${name(item)}${previous(item).length ? ' (previous kept)' : ' (missing)'}: ${error}`);
  return { records, warning: `${errors.size} of ${items.length} failed. ${failed.join('; ')}` };
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
  produce: () => Promise<{ records: unknown[]; meta: StaticMeta; warning?: string }>;
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
}: PublishOptions<T>): Promise<{ ok: true; meta: DatasetMeta; warning?: string } | { ok: false; error: string }> {
  const dataPath = join(dataDir, `${id}.json`);
  const metaPath = join(dataDir, 'meta', `${id}.json`);
  const at = now().toISOString();
  try {
    const { records, meta, warning } = await produce();
    const valid = validateRecords(id, records, schema);
    const full = successMeta(id, valid.length, meta, at, warning);
    await writeJsonAtomic(dataPath, valid);
    await writeJsonAtomic(metaPath, full);
    return { ok: true, meta: full, ...(warning ? { warning } : {}) };
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
    if (result.warning) {
      console.error(`${id}: PARTLY FAILED. ${result.warning}`);
      process.exitCode = 1;
    }
  } else {
    console.error(`${id}: FAILED, previous file kept. ${result.error}`);
    process.exitCode = 1;
  }
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
