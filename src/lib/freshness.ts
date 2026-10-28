import type { DatasetMeta } from '../types';
import { DATASET_FRESHNESS } from './config';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 h ago", "2 d ago" */
export function formatAge(iso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - Date.parse(iso));
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  return `${Math.floor(ms / DAY)} d ago`;
}

/** "14:02 UTC" */
export function formatUtcClock(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

export interface Freshness {
  id: string;
  label: string;
  scheduled: boolean;
  fetchedAt: string;
  dataThrough?: string;
  /** Scheduled and older than its expected cadence allows. */
  stale: boolean;
  /** The most recent run failed; fetchedAt still describes the file in use. */
  failedAt?: string;
}

export function datasetFreshness(meta: DatasetMeta, now: Date): Freshness {
  const config = DATASET_FRESHNESS[meta.id] ?? { label: meta.id, scheduled: false };
  const ageHours = (now.getTime() - Date.parse(meta.fetchedAt)) / HOUR;
  return {
    id: meta.id,
    label: config.label,
    scheduled: config.scheduled,
    fetchedAt: meta.fetchedAt,
    dataThrough: meta.dataThrough,
    stale: config.scheduled && config.staleAfterHours !== undefined && ageHours > config.staleAfterHours,
    ...(meta.lastAttempt && !meta.lastAttempt.ok ? { failedAt: meta.lastAttempt.at } : {}),
  };
}

/**
 * The footer's single "Updated" line: the oldest scheduled dataset, since that is how
 * current the whole picture is. Falls back to the newest manual import.
 */
export function overallFreshness(items: Freshness[]): Freshness | null {
  const scheduled = items.filter((f) => f.scheduled).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
  if (scheduled.length) return scheduled[0]!;
  return [...items].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0] ?? null;
}

/** Display order: scheduled first, then by label. */
export function sortFreshness(items: Freshness[]): Freshness[] {
  return [...items].sort((a, b) => Number(b.scheduled) - Number(a.scheduled) || a.label.localeCompare(b.label));
}
