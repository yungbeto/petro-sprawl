import { useEffect, useState } from 'react';
import type { DatasetMeta } from '../types';
import { EMPTY_DATASETS, type Datasets } from '../lib/data';
import { withMeasuredEvidence, withMeasuredLngEvidence } from '../lib/evidence';

const DATASET_IDS = ['basins', 'chokepoints', 'pipelines', 'lng-terminals', 'oil-terminals', 'countries', 'chokepoint-transits', 'port-calls', 'gas-flows', 'gas-storage', 'lng-sendout', 'disruptions', 'oil-origins', 'fuel-origins', 'oil-routes', 'us-lookup'] as const;

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
      const get = (id: (typeof DATASET_IDS)[number]) => results.find((r) => r.id === id)?.records ?? [];
      const series = [
        ...get('chokepoint-transits'),
        ...get('port-calls'),
        ...get('gas-flows'),
        ...get('gas-storage'),
        ...get('lng-sendout'),
      ] as Datasets['series'];
      setState({
        loaded: true,
        failed: results.filter((r) => r.records === null).map((r) => r.id),
        data: {
          basins: get('basins') as Datasets['basins'],
          chokepoints: get('chokepoints') as Datasets['chokepoints'],
          // Measured flow goes first in each linked pipeline's evidence, so it sets the current status.
          pipelines: withMeasuredEvidence(get('pipelines') as Datasets['pipelines'], series),
          // Measured send-out goes first for EU import terminals ALSI reports.
          lngTerminals: withMeasuredLngEvidence(get('lng-terminals') as Datasets['lngTerminals'], series),
          oilTerminals: get('oil-terminals') as Datasets['oilTerminals'],
          countries: get('countries') as Datasets['countries'],
          series,
          disruptions: get('disruptions') as Datasets['disruptions'],
          oilOrigins: get('oil-origins') as Datasets['oilOrigins'],
          fuelOrigins: get('fuel-origins') as Datasets['fuelOrigins'],
          oilRoutes: get('oil-routes') as Datasets['oilRoutes'],
          // One record holding every table.
          usLookup: (get('us-lookup')[0] as Datasets['usLookup']) ?? null,
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
