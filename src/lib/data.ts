import type {
  Basin,
  Chokepoint,
  Country,
  CountryCrudeImports,
  UsRegion,
  CountryRegion,
  DatasetMeta,
  Disruption,
  FuelOriginRegion,
  LngTerminal,
  ObservationSeries,
  OilOriginRegion,
  OilRoute,
  OilTerminal,
  Pipeline,
  UsLookup,
} from '../types';
import { chokepointFlow, type ChokepointFlow } from './flow';
import type { FilterMatches } from './filters';
import { regionOrigins, type OriginRow, type RegionOrigins } from './oilOrigins';
import { fuelOrigins, type FuelOrigins } from './fuelOrigins';
import { PORT_CALLS, portCallsSeriesId, portExportsSeriesId, type FuelId, type RegionFuel } from './config';
import type { Selection } from '../app/urlState';
import { lineTouchesPolygon, pointInPolygon } from './geo';
import { withMeasuredEvidence, withMeasuredLngEvidence } from './evidence';

export interface Datasets {
  basins: Basin[];
  chokepoints: Chokepoint[];
  pipelines: Pipeline[];
  lngTerminals: LngTerminal[];
  oilTerminals: OilTerminal[];
  countries: Country[];
  /** Every country's World Bank region, keyed by ISO code. */
  countryRegions: CountryRegion[];
  series: ObservationSeries[];
  disruptions: Disruption[];
  /** "Where is my oil from?": EIA crude supply by PADD, curated export routes and the US lookup tables. */
  oilOrigins: OilOriginRegion[];
  /** "Where is my fuel from?" (M7): gasoline, diesel and jet fuel by PADD. */
  fuelOrigins: FuelOriginRegion[];
  oilRoutes: OilRoute[];
  /** Crude imports by partner, by country (M10). */
  crudeImports: CountryCrudeImports[];
  usLookup: UsLookup | null;
  /** The PADDs as outlines, for the fuel origins map. */
  usRegions: UsRegion[];
  meta: DatasetMeta[];
}

export const EMPTY_DATASETS: Datasets = {
  basins: [],
  chokepoints: [],
  pipelines: [],
  lngTerminals: [],
  oilTerminals: [],
  countries: [],
  countryRegions: [],
  series: [],
  disruptions: [],
  oilOrigins: [],
  fuelOrigins: [],
  oilRoutes: [],
  crudeImports: [],
  usLookup: null,
  usRegions: [],
  meta: [],
};

/** Every published dataset the app loads, as `public/data/<id>.json`. */
export const DATASET_IDS = ['basins', 'chokepoints', 'pipelines', 'lng-terminals', 'oil-terminals', 'countries', 'country-regions', 'chokepoint-transits', 'port-calls', 'gas-flows', 'gas-storage', 'gas-storage-us', 'gas-storage-ca', 'gas-storage-jodi', 'lng-sendout', 'disruptions', 'oil-origins', 'fuel-origins', 'oil-routes', 'crude-imports', 'us-lookup', 'us-regions'] as const;
export type DatasetId = (typeof DATASET_IDS)[number];

/**
 * The loaded files as the app uses them, in the browser and in the share index build: series in one
 * list, and measured flow and send-out folded into the assets' evidence.
 */
export function assembleDatasets(get: (id: DatasetId) => unknown[], meta: DatasetMeta[]): Datasets {
  const series = [
    ...get('chokepoint-transits'),
    ...get('port-calls'),
    ...get('gas-flows'),
    ...get('gas-storage'),
    ...get('gas-storage-us'),
    ...get('gas-storage-ca'),
    ...get('gas-storage-jodi'),
    ...get('lng-sendout'),
  ] as Datasets['series'];
  return {
    basins: get('basins') as Datasets['basins'],
    chokepoints: get('chokepoints') as Datasets['chokepoints'],
    // Measured flow goes first in each linked pipeline's evidence, so it sets the current status.
    pipelines: withMeasuredEvidence(get('pipelines') as Datasets['pipelines'], series),
    // Measured send-out goes first for EU import terminals ALSI reports.
    lngTerminals: withMeasuredLngEvidence(get('lng-terminals') as Datasets['lngTerminals'], series),
    oilTerminals: get('oil-terminals') as Datasets['oilTerminals'],
    countries: get('countries') as Datasets['countries'],
    countryRegions: get('country-regions') as Datasets['countryRegions'],
    series,
    disruptions: get('disruptions') as Datasets['disruptions'],
    oilOrigins: get('oil-origins') as Datasets['oilOrigins'],
    fuelOrigins: get('fuel-origins') as Datasets['fuelOrigins'],
    oilRoutes: get('oil-routes') as Datasets['oilRoutes'],
    crudeImports: get('crude-imports') as Datasets['crudeImports'],
    // One record holding every table.
    usLookup: (get('us-lookup')[0] as Datasets['usLookup']) ?? null,
    usRegions: get('us-regions') as Datasets['usRegions'],
    meta,
  };
}

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
  /** PortWatch's estimate of tanker exports in metric tons, when loaded. */
  exports: ChokepointFlow | null;
}

/** Tanker calls and estimated exports at one PortWatch port, or null before the calls load. */
export function portCallsAt(data: Datasets, portwatchId: string, port: string): PortCalls | null {
  const flow = chokepointFlow(seriesById(data, portCallsSeriesId(portwatchId)));
  return flow ? { port, flow, exports: chokepointFlow(seriesById(data, portExportsSeriesId(portwatchId))) } : null;
}

/** Tanker port calls at the ports a pipeline ends at, for those PortWatch reports and that have loaded. */
export function portCallsFor(
  data: Datasets,
  pipelineId: string,
  ports: readonly { portwatchId: string; name: string; pipelineIds: readonly string[] }[] = PORT_CALLS.ports,
): PortCalls[] {
  return ports.flatMap((port) => {
    if (!port.pipelineIds.includes(pipelineId)) return [];
    const calls = portCallsAt(data, port.portwatchId, port.name);
    return calls ? [calls] : [];
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
  | { kind: 'country'; item: Country }
  | { kind: 'lng'; item: LngTerminal }
  | { kind: 'terminal'; item: OilTerminal }
  | { kind: 'region'; item: OilOriginRegion };

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
    case 'country': {
      const item = data.countries.find((c) => c.id.toLowerCase() === selection.id);
      return item ? { kind: 'country', item } : null;
    }
    case 'lng': {
      const item = data.lngTerminals.find((t) => t.id === selection.id);
      return item ? { kind: 'lng', item } : null;
    }
    case 'terminal': {
      const item = data.oilTerminals.find((t) => t.id === selection.id);
      return item ? { kind: 'terminal', item } : null;
    }
    case 'region': {
      const item = data.oilOrigins.find((r) => r.id === selection.id);
      return item ? { kind: 'region', item } : null;
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

/** A region's crude origins, with the routes and terminals the data names. */
export function originsFor(data: Datasets, region: OilOriginRegion): RegionOrigins | null {
  return regionOrigins(region, { routes: data.oilRoutes, terminals: data.oilTerminals });
}

/** Where one region's gasoline, diesel or jet fuel comes from. */
export function fuelOriginsFor(data: Datasets, region: string, fuel: FuelId): FuelOrigins | null {
  const record = data.fuelOrigins.find((r) => r.id === `${region}/${fuel}`);
  return record ? fuelOrigins(record) : null;
}

/** Every US fuel region with where one fuel (or crude) comes from, largest share first. Regions without data are left out. */
export function originsByRegion(data: Datasets, fuel: RegionFuel): { region: OilOriginRegion; rows: OriginRow[] }[] {
  return data.oilOrigins.flatMap((region) => {
    const rows = fuel === 'crude' ? originsFor(data, region)?.rows : fuelOriginsFor(data, region.id, fuel)?.rows;
    return rows?.length ? [{ region, rows }] : [];
  });
}

/** What the fuel origins surface keeps bright: the chokepoints and terminals on any region's crude routes. */
export function fuelSurfaceHighlight(data: Datasets): FilterMatches {
  const lit = data.oilOrigins.map((region) => regionHighlight(originsFor(data, region)));
  return {
    pipelines: new Set(),
    chokepoints: new Set(lit.flatMap((l) => [...l.chokepoints])),
    lng: new Set(),
    terminals: new Set(lit.flatMap((l) => [...l.terminals])),
  };
}

/** What a region view keeps at full strength on the map: chokepoints and terminals on its routes. */
export function regionHighlight(origins: RegionOrigins | null): FilterMatches {
  return {
    pipelines: new Set(),
    chokepoints: new Set(origins?.exposure.map((e) => e.chokepoint) ?? []),
    lng: new Set(),
    terminals: new Set(origins?.rows.flatMap((r) => r.terminals?.map((t) => t.id) ?? []) ?? []),
  };
}
