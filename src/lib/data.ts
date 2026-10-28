import type { Basin, Chokepoint, DatasetMeta, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import { lineTouchesPolygon, pointInPolygon } from './geo';

export interface Datasets {
  basins: Basin[];
  chokepoints: Chokepoint[];
  pipelines: Pipeline[];
  meta: DatasetMeta[];
}

export const EMPTY_DATASETS: Datasets = { basins: [], chokepoints: [], pipelines: [], meta: [] };

export type Resolved =
  | { kind: 'pipeline'; item: Pipeline }
  | { kind: 'chokepoint'; item: Chokepoint }
  | { kind: 'basin'; item: Basin };

/** Finds the selected item in the loaded data, or null if it isn't there. */
export function resolveSelection(selection: Selection | null, data: Datasets): Resolved | null {
  if (!selection) return null;
  switch (selection.kind) {
    case 'pipeline': {
      const item = data.pipelines.find((p) => p.id === selection.id);
      return item ? { kind: 'pipeline', item } : null;
    }
    case 'chokepoint': {
      const item = data.chokepoints.find((c) => c.id === selection.id);
      return item ? { kind: 'chokepoint', item } : null;
    }
    case 'basin': {
      const item = data.basins.find((b) => b.id === selection.id);
      return item ? { kind: 'basin', item } : null;
    }
    default:
      return null;
  }
}

export function chokepointsInBasin(basin: Basin, chokepoints: Chokepoint[]): Chokepoint[] {
  return chokepoints.filter((c) => pointInPolygon(c.point, basin.geometry));
}

export function pipelinesTouchingBasin(basin: Basin, pipelines: Pipeline[]): Pipeline[] {
  return pipelines.filter((p) => lineTouchesPolygon(p.geometry, basin.geometry));
}
