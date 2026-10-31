import { useEffect, useState } from 'react';
import { FEATURES, STORAGE_KEYS } from '../lib/config';
import { resolveSelection, type Datasets } from '../lib/data';
import { formatCountry } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';
import { diffSnapshots, nextVisit, parseVisitRecord, takeSnapshot, type Change } from '../lib/summary';
import type { Selection } from './urlState';

export interface VisitChanges {
  /** When the visit being compared against happened; null on a first visit or without storage. */
  since: string | null;
  changes: Change[];
}

/**
 * Compares the loaded data with the last visit, once per page load. Nothing is stored when a
 * dataset failed to load, so a bad load never becomes the next visit's baseline. With
 * `FEATURES.visitChanges` off it stores nothing, removes what an earlier visit stored, and returns null.
 */
export function useVisitChanges(data: Datasets, loaded: boolean, failed: string[]): VisitChanges | null {
  const [result, setResult] = useState<VisitChanges | null>(null);

  useEffect(() => {
    if (!FEATURES.visitChanges) {
      writeStorage(STORAGE_KEYS.visits, null);
      return;
    }
    if (!loaded || result) return;
    const snapshot = takeSnapshot(data, new Date());
    const { compareTo, record } = nextVisit(parseVisitRecord(readStorage(STORAGE_KEYS.visits)), snapshot);
    if (failed.length === 0) writeStorage(STORAGE_KEYS.visits, JSON.stringify(record));
    const name = (selection: Selection) =>
      selection.kind === 'storage'
        ? formatCountry(selection.id.toUpperCase())
        : (resolveSelection(selection, data)?.item.name ?? selection.id);
    setResult({
      since: compareTo?.savedAt ?? null,
      changes: compareTo ? diffSnapshots(compareTo, snapshot, data, name) : [],
    });
  }, [loaded]);

  return result;
}
