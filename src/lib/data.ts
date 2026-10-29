import type { Basin, Chokepoint, Country, DatasetMeta, Disruption, LngTerminal, ObservationSeries, OilTerminal, Pipeline } from '../types';
import { chokepointFlow, type ChokepointFlow } from './flow';
import { PORT_CALLS, portCallsSeriesId } from './config';
import type { Selection } from '../app/urlState';
import { lineTouchesPolygon, pointInPolygon } from './geo';

export interface Datasets {
  basins: Basin[];
  chokepoints: Chokepoint[];
  pipelines: Pipeline[];
  lngTerminals: LngTerminal[];
  oilTerminals: OilTerminal[];
  countries: Country[];
  series: ObservationSeries[];
  disruptions: Disruption[];
  meta: DatasetMeta[];
}

export const EMPTY_DATASETS: Datasets = {
  basins: [],
  chokepoints: [],
  pipelines: [],
  lngTerminals: [],
  oilTerminals: [],
  countries: [],
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

export interface PortCalls {
  port: string;
  flow: ChokepointFlow;
}

/** Tanker port calls at the ports a pipeline ends at, for those PortWatch reports and that have loaded. */
export function portCallsFor(
  data: Datasets,
  pipelineId: string,
  ports: readonly { portwatchId: string; name: string; pipelineIds: readonly string[] }[] = PORT_CALLS.ports,
): PortCalls[] {
  return ports.flatMap((port) => {
    if (!port.pipelineIds.includes(pipelineId)) return [];
    const flow = chokepointFlow(seriesById(data, portCallsSeriesId(port.portwatchId)));
    return flow ? [{ port: port.name, flow }] : [];
  });
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
  | { kind: 'basin'; item: Basin }
  | { kind: 'storage'; item: Country }
  | { kind: 'lng'; item: LngTerminal }
  | { kind: 'terminal'; item: OilTerminal };

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
    case 'storage': {
      const item = data.countries.find((c) => c.id.toLowerCase() === selection.id);
      return item ? { kind: 'storage', item } : null;
    }
    case 'lng': {
      const item = data.lngTerminals.find((t) => t.id === selection.id);
      return item ? { kind: 'lng', item } : null;
    }
    case 'terminal': {
      const item = data.oilTerminals.find((t) => t.id === selection.id);
      return item ? { kind: 'terminal', item } : null;
    }
    default:
      return null;
  }
}

export function chokepointsInBasin(basin: Basin, chokepoints: Chokepoint[]): Chokepoint[] {
  return chokepoints.filter((c) => pointInPolygon(c.point, basin.geometry));
}

export function lngTerminalsInBasin(basin: Basin, terminals: LngTerminal[]): LngTerminal[] {
  return terminals.filter((t) => pointInPolygon(t.point, basin.geometry));
}

/** Oil terminals a pipeline ends at. */
export function terminalsForPipeline(data: Datasets, pipelineId: string): OilTerminal[] {
  return data.oilTerminals.filter((t) => t.pipelineIds.includes(pipelineId));
}

/** Oil terminals whose tankers pass a chokepoint on the way to open sea. */
export function terminalsViaChokepoint(data: Datasets, chokepointId: string): OilTerminal[] {
  return data.oilTerminals.filter((t) => (t.exitVia as string[]).includes(chokepointId));
}

/** A pipeline's own disruptions and those at the terminals it ends at, most recent start first. */
export function pipelineDisruptions(data: Datasets, pipelineId: string): Disruption[] {
  const terminals = terminalsForPipeline(data, pipelineId).map((t) => t.id);
  return data.disruptions
    .filter(
      (d) =>
        (d.assetKind === 'pipeline' && d.assetId === pipelineId) || (d.assetKind === 'terminal' && terminals.includes(d.assetId)),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** The other sections of the system a pipeline belongs to; none when it isn't part of one. */
export function systemSections(pipeline: Pipeline, pipelines: Pipeline[]): Pipeline[] {
  if (!pipeline.system) return [];
  return pipelines.filter((p) => p.system === pipeline.system && p.id !== pipeline.id);
}

export function pipelinesTouchingBasin(basin: Basin, pipelines: Pipeline[]): Pipeline[] {
  return pipelines.filter((p) => lineTouchesPolygon(p.geometry, basin.geometry));
}
