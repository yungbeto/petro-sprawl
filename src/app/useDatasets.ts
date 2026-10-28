import { useEffect, useState } from 'react';
import type { DatasetMeta } from '../types';
import { EMPTY_DATASETS, type Datasets } from '../lib/data';

const DATASET_IDS = ['basins', 'chokepoints', 'pipelines', 'chokepoint-transits', 'disruptions'] as const;

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

export function useDatasets(): { data: Datasets; loaded: boolean } {
  const [state, setState] = useState({ data: EMPTY_DATASETS, loaded: false });

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
      const get = (id: (typeof DATASET_IDS)[number]) => results.find((r) => r.id === id)?.records ?? [];
      setState({
        loaded: true,
        data: {
          basins: get('basins') as Datasets['basins'],
          chokepoints: get('chokepoints') as Datasets['chokepoints'],
          pipelines: get('pipelines') as Datasets['pipelines'],
          series: get('chokepoint-transits') as Datasets['series'],
          disruptions: get('disruptions') as Datasets['disruptions'],
          meta: results.flatMap((r) => (r.meta ? [r.meta] : [])),
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
