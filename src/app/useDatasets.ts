import { useEffect, useState } from 'react';
import type { DatasetMeta } from '../types';
import { assembleDatasets, DATASET_IDS, EMPTY_DATASETS, type Datasets } from '../lib/data';


async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
    if (!response.ok) return null;
    // A missing file can come back as the SPA's index.html in dev.
    if (!response.headers.get('content-type')?.includes('json')) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface DatasetsState {
  data: Datasets;
  loaded: boolean;
  /** Datasets whose file didn't load; the app shows what did. */
  failed: string[];
}

export function useDatasets(): DatasetsState {
  const [state, setState] = useState<DatasetsState>({ data: EMPTY_DATASETS, loaded: false, failed: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DATASET_IDS.map(async (id) => ({
        id,
        records: await fetchJson<unknown[]>(`${id}.json`),
        meta: await fetchJson<DatasetMeta>(`meta/${id}.json`),
      })),
    ).then((results) => {
      if (cancelled) return;
      const records = new Map(results.map((r) => [r.id, r.records ?? []]));
      setState({
        loaded: true,
        failed: results.filter((r) => r.records === null).map((r) => r.id),
        data: assembleDatasets((id) => records.get(id) ?? [], results.flatMap((r) => (r.meta ? [r.meta] : []))),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
