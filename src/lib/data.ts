import type { Basin, Chokepoint, DatasetMeta, Disruption, ObservationSeries, Pipeline } from '../types';
import { chokepointFlow, type ChokepointFlow } from './flow';
import type { Selection } from '../app/urlState';
import { lineTouchesPolygon, pointInPolygon } from './geo';

export interface Datasets {
  basins: Basin[];
  chokepoints: Chokepoint[];
  pipelines: Pipeline[];
  series: ObservationSeries[];
  disruptions: Disruption[];
  meta: DatasetMeta[];
}

export const EMPTY_DATASETS: Datasets = {
  basins: [],
  chokepoints: [],
  pipelines: [],
  series: [],
  disruptions: [],
  meta: [],
};

/** Flow for every chokepoint that has a transit series, keyed by chokepoint id. */
export function chokepointFlows(data: Datasets): Map<string, ChokepointFlow> {
  const flows = new Map<string, ChokepointFlow>();
  for (const c of data.chokepoints) {
    const flow = chokepointFlow(seriesById(data, c.transitSeriesId));
    if (flow) flows.set(c.id, flow);
  }
  return flows;
}

/** Disruptions for one asset, most recent start first. */
export function disruptionsFor(data: Datasets, kind: Disruption['assetKind'], id: string): Disruption[] {
  return data.disruptions
    .filter((d) => d.assetKind === kind && d.assetId === id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function seriesById(data: Datasets, id: string | undefined): ObservationSeries | undefined {
  return id ? data.series.find((s) => s.id === id) : undefined;
}

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
