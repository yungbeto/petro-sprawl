import { GeoJsonLayer, IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import type { Layer } from '@deck.gl/core';
import type { AssetStatus, Basin, Chokepoint, Country, Field, LngTerminal, OilTerminal, Pipeline, Refinery, ShalePlay, UsRegion } from '../types';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { CHOKEPOINT_RADIUS, FIELD_MARKER, FILTERS, LNG_RADIUS, ORIGIN_ARC, PIPELINE_WIDTH, REFINERY_RADIUS, REGION_OUTLINE, SHALE, STORAGE_NOT_COVERED, TERMINAL_MARKER } from '../lib/config';
import { storageColor, type CountryStorage } from '../lib/gasStorage';
import type { OriginArc } from '../lib/oilOrigins';
import type { FilterMatches } from '../lib/filters';
import {
  chokepointRadiusPx,
  flowFillRadiusPx,
  flowLineWidthPx,
  lngRadiusPx,
  lngStatus,
  pipelineStatus,
  pipelineWidthPx,
  refineryRadiusPx,
  refineryStatus,
  terminalStatus,
  statusAlpha,
} from '../lib/encoding';
import type { ChokepointFlow, FlowBand } from '../lib/flow';
import { withAlpha } from '../lib/color';
import { fieldRadiusPx, fieldScale, fieldStatus } from '../lib/fields';
import type { MapColors } from './colors';
import { FlowArcLayer } from './FlowArcLayer';

import type { LayerId, LayerVisibility } from '../lib/views';
export type { LayerId, LayerVisibility };

export type PickedObject =
  | { kind: 'basin'; item: Basin }
  | { kind: 'shale'; item: ShalePlay }
  | { kind: 'pipeline'; item: Pipeline }
  | { kind: 'chokepoint'; item: Chokepoint }
  | { kind: 'country'; item: Country }
  | { kind: 'lng'; item: LngTerminal }
  | { kind: 'terminal'; item: OilTerminal }
  | { kind: 'refinery'; item: Refinery }
  | { kind: 'field'; item: Field }
  | { kind: 'region'; item: UsRegion };

interface PipelinePath {
  pipeline: Pipeline;
  path: Position[];
}

function statusColor(status: AssetStatus, colors: MapColors) {
  switch (status) {
    case 'operating':
      return colors.operating;
    case 'reduced':
      return colors.reduced;
    case 'offline':
    case 'idle':
      return colors.offline;
    default:
      return colors.unknown;
  }
}

/** A diamond, drawn as a mask so deck.gl can color it per terminal. */
const DIAMOND = {
  id: 'diamond',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M32 3 L61 32 L32 61 L3 32 Z" fill="#000"/></svg>',
  )}`,
  width: 64,
  height: 64,
  mask: true,
};

/** A square with rounded corners, for refineries: the same mask trick, a shape LNG's dots and the terminals' diamonds don't use. */
const SQUARE = {
  id: 'square',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="4" y="4" width="56" height="56" rx="10" fill="#000"/></svg>',
  )}`,
  width: 64,
  height: 64,
  mask: true,
};

/** A triangle pointing up, for oil and gas fields: the mask trick again, a shape no other asset uses. */
const TRIANGLE = {
  id: 'triangle',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M32 6 L60 56 L4 56 Z" fill="#000"/></svg>',
  )}`,
  width: 64,
  height: 64,
  mask: true,
};

/**
 * Remembers the last result by argument identity. Layer data must keep its identity between rebuilds,
 * or deck.gl regenerates every attribute (and re-tessellates polygons) on each hover or pan.
 */
function memoLast<A extends unknown[], T>(build: (...args: A) => T): (...args: A) => T {
  let last: { args: A; value: T } | null = null;
  return (...args) => {
    if (!last || args.length !== last.args.length || args.some((a, i) => a !== last!.args[i])) last = { args, value: build(...args) };
    return last.value;
  };
}

const basinCollection = memoLast(
  (basins: Basin[]): FeatureCollection<Polygon | MultiPolygon, Basin> => ({
    type: 'FeatureCollection',
    features: basins.map((basin) => ({ type: 'Feature', geometry: basin.geometry, properties: basin })),
  }),
);

const shaleCollection = memoLast(
  (plays: ShalePlay[]): FeatureCollection<Polygon | MultiPolygon, ShalePlay> => ({
    type: 'FeatureCollection',
    features: plays.map((play) => ({ type: 'Feature', geometry: play.geometry, properties: play })),
  }),
);

/** Countries with a storage figure, and those named as not covered (drawn faint). */
const storageCollection = memoLast(
  (countries: Country[], storage: Map<string, CountryStorage>): FeatureCollection<Polygon | MultiPolygon, Country> => ({
    type: 'FeatureCollection',
    features: countries
      .filter((c) => storage.has(c.id) || NOT_COVERED.has(c.id))
      .map((country) => ({ type: 'Feature', geometry: country.geometry, properties: country })),
  }),
);
const NOT_COVERED = new Set(STORAGE_NOT_COVERED.map((c) => c.country));

/** Countries with crude import data, for the oil origins surface. */
const importerCollection = memoLast(
  (countries: Country[], importers: Set<string>): FeatureCollection<Polygon | MultiPolygon, Country> => ({
    type: 'FeatureCollection',
    features: countries.filter((c) => importers.has(c.id)).map((country) => ({ type: 'Feature', geometry: country.geometry, properties: country })),
  }),
);

/** What the country layer shows: gas storage against last year, or which countries have crude import data. */
export type CountryMode = 'storage' | 'imports';


const regionCollection = memoLast(
  (regions: UsRegion[]): FeatureCollection<Polygon | MultiPolygon, UsRegion> => ({
    type: 'FeatureCollection',
    features: regions.map((region) => ({ type: 'Feature', geometry: region.geometry, properties: region })),
  }),
);

const pathsCache = new WeakMap<Pipeline[], PipelinePath[]>();

/**
 * One path per line of each pipeline. Cached per pipelines array: the same array keeps deck.gl from
 * re-uploading every vertex to the GPU each time the layers are rebuilt (on hover, pan or selection).
 */
function pipelinePaths(pipelines: Pipeline[]): PipelinePath[] {
  let paths = pathsCache.get(pipelines);
  if (!paths) {
    paths = pipelines.flatMap((pipeline) =>
      pipeline.geometry.type === 'LineString'
        ? [{ pipeline, path: pipeline.geometry.coordinates }]
        : pipeline.geometry.coordinates.map((path) => ({ pipeline, path })),
    );
    pathsCache.set(pipelines, paths);
  }
  return paths;
}

function bandColor(band: FlowBand | null | undefined, colors: MapColors) {
  switch (band) {
    case 'below':
      return colors.flowBelow;
    case 'near':
      return colors.flowNear;
    case 'above':
      return colors.flowAbove;
    default:
      return colors.ink;
  }
}

interface BuildLayersInput {
  data: Datasets;
  flows: Map<string, ChokepointFlow>;
  /** Measured flow as a share of technical capacity, by pipeline id. */
  pipelineShares: Map<string, number>;
  /** Gas storage by country id. */
  storage: Map<string, CountryStorage>;
  countryMode: CountryMode;
  /** Countries with crude import data, by id. */
  importers: Set<string>;
  visibility: LayerVisibility;
  selection: Selection | null;
  highlight: FilterMatches | null;
  /** The pipeline under the pointer, drawn highlighted. */
  hoveredPipelineId: string | null;
  /** Draw only these pipelines (an open basin's, in a surface); null draws them all. */
  onlyPipelines: Set<string> | null;
  /** Fields kept bright (an open group's, or none under a quick filter); null keeps them all. */
  fieldHighlight: Set<string> | null;
  /** A region view's origin arcs ("Where is my oil from?"); empty otherwise. */
  originArcs: OriginArc[];
  /** Pulses run along the arcs toward the open place; off under reduced motion. */
  animateArcs: boolean;
  /** The fuel origins surface or a region view: the region outlines and arcs only, every other layer off. */
  regionsOnly: boolean;
  /** The basins surface: stronger outlines with a faint fill, since they're all the map shows. */
  basinsFocus: boolean;
  /** Below this zoom the five names would overlap. */
  regionLabelMinZoom: number;
  colors: MapColors;
  zoom: number;
  basinLabelMinZoom: number;
  fontFamily: string;
}

export function buildLayers({
  data,
  flows,
  pipelineShares,
  storage,
  countryMode,
  importers,
  visibility,
  selection,
  highlight,
  hoveredPipelineId,
  onlyPipelines,
  fieldHighlight,
  originArcs,
  animateArcs,
  regionsOnly,
  basinsFocus,
  regionLabelMinZoom,
  colors,
  zoom,
  basinLabelMinZoom,
  fontFamily,
}: BuildLayersInput): Layer[] {
  if (regionsOnly) visibility = { storage: false, basins: false, shale: false, fields: false, pipelines: false, lng: false, terminals: false, refineries: false, chokepoints: false };
  const isSelected = (kind: Selection['kind'], id: string) => selection?.kind === kind && selection.id === id;
  // A quick filter fades whatever it doesn't match; the selection always stays at full strength.
  const pipelineFade = (id: string) =>
    !highlight || highlight.pipelines.has(id) || isSelected('pipeline', id) ? 1 : FILTERS.fadeAlpha;
  const chokepointFade = (id: string) =>
    !highlight || highlight.chokepoints.has(id) || isSelected('chokepoint', id) ? 1 : FILTERS.fadeAlpha;
  const lngFade = (id: string) => (!highlight || highlight.lng.has(id) || isSelected('lng', id) ? 1 : FILTERS.fadeAlpha);
  const terminalFade = (id: string) =>
    !highlight || highlight.terminals.has(id) || isSelected('terminal', id) ? 1 : FILTERS.fadeAlpha;
  const refineryFade = (id: string) =>
    !highlight || highlight.refineries.has(id) || isSelected('refinery', id) ? 1 : FILTERS.fadeAlpha;
  const fieldFade = (id: string) => (!fieldHighlight || fieldHighlight.has(id) || isSelected('field', id) ? 1 : FILTERS.fadeAlpha);
  const scale = fieldScale(data.fields);
  const importTerminals = data.lngTerminals.filter((t) => t.facility === 'import');

  const basinFeatures = basinCollection(data.basins);
  const shaleFormation = selection?.kind === 'shale' ? data.shalePlays.find((p) => p.id === selection.id)?.formation : undefined;
  const paths = pipelinePaths(onlyPipelines ? data.pipelines.filter((p) => onlyPipelines.has(p.id)) : data.pipelines);
  const selectedPaths = paths.filter((p) => isSelected('pipeline', p.pipeline.id));
  const hoveredPaths = paths.filter((p) => p.pipeline.id === hoveredPipelineId);
  const flowPaths = paths.filter((p) => (pipelineShares.get(p.pipeline.id) ?? 0) > 0 && pipelineFade(p.pipeline.id) === 1);

  const imports = countryMode === 'imports';
  const countryFeatures = imports ? importerCollection(data.countries, importers) : storageCollection(data.countries, storage);

  return [
    // Countries, under everything else (SPEC M10): gas storage against last year on a diverging scale, or
    // on oil origins every country with crude import data in one neutral fill, the open one darker.
    new GeoJsonLayer<Country>({
      id: 'storage',
      data: countryFeatures,
      visible: visibility.storage,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f: Feature<Geometry, Country>) =>
        imports
          ? isSelected('country', f.properties.id.toLowerCase())
            ? colors.importerOpen
            : colors.importer
          : storageColor(storage.get(f.properties.id), colors),
      getLineColor: (f: Feature<Geometry, Country>) =>
        isSelected('country', f.properties.id.toLowerCase()) ? colors.selection : colors.storageLine,
      getLineWidth: (f: Feature<Geometry, Country>) => (isSelected('country', f.properties.id.toLowerCase()) ? 2 : 0.5),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: colors.basinFillHover,
      updateTriggers: { getFillColor: [storage, imports, selection, colors], getLineColor: [selection, colors], getLineWidth: [selection] },
    }),
    new GeoJsonLayer<Basin>({
      id: 'basins',
      data: basinFeatures,
      visible: visibility.basins,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: basinsFocus ? colors.basinFillFocus : [0, 0, 0, 0],
      getLineColor: (f: Feature<Geometry, Basin>) =>
        isSelected('basin', f.properties.id) ? colors.selection : basinsFocus ? colors.basinLineFocus : colors.basinLine,
      getLineWidth: (f: Feature<Geometry, Basin>) => (isSelected('basin', f.properties.id) ? 2 : basinsFocus ? 1.5 : 1),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: colors.basinFillHover,
      updateTriggers: {
        getFillColor: [basinsFocus, colors],
        getLineColor: [selection, basinsFocus, colors],
        getLineWidth: [selection, basinsFocus],
      },
    }),
    new TextLayer<Basin>({
      id: 'basin-labels',
      data: data.basins,
      visible: visibility.basins && zoom >= basinLabelMinZoom,
      getPosition: (b) => b.labelPoint,
      getText: (b) => b.name,
      getSize: 11,
      getColor: colors.basinLabel,
      fontFamily,
      characterSet: 'auto',
      outlineWidth: 2,
      outlineColor: colors.halo,
      fontSettings: { sdf: true },
      updateTriggers: { getColor: [colors] },
    }),
    // Shale plays (SPEC M12) over the provinces: EIA's outlines, filled, since a play is an area of rock
    // that is drilled. The open play and the others of its formation draw stronger.
    new GeoJsonLayer<ShalePlay>({
      id: 'shale',
      data: shaleCollection(data.shalePlays),
      visible: visibility.shale,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f: Feature<Geometry, ShalePlay>) => (shaleFormation && f.properties.formation === shaleFormation ? colors.shaleFillHover : colors.shaleFill),
      getLineColor: (f: Feature<Geometry, ShalePlay>) => (isSelected('shale', f.properties.id) ? colors.selection : colors.shaleLine),
      getLineWidth: (f: Feature<Geometry, ShalePlay>) => (isSelected('shale', f.properties.id) ? 2 : 1),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: colors.shaleFillHover,
      updateTriggers: { getFillColor: [shaleFormation, colors], getLineColor: [selection, colors], getLineWidth: [selection] },
    }),
    new TextLayer<ShalePlay>({
      id: 'shale-labels',
      data: data.shalePlays,
      visible: visibility.shale && zoom >= basinLabelMinZoom + SHALE.labelZoomOffset,
      getPosition: (p) => p.labelPoint,
      getText: (p) => p.name,
      getSize: 10,
      getColor: colors.shaleLabel,
      fontFamily,
      characterSet: 'auto',
      outlineWidth: 2,
      outlineColor: colors.halo,
      fontSettings: { sdf: true },
      updateTriggers: { getColor: [colors] },
    }),
    new PathLayer<PipelinePath>({
      id: 'pipeline-selection',
      data: selectedPaths,
      visible: visibility.pipelines,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => pipelineWidthPx(p.pipeline) + 4,
      getColor: colors.selection,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
    }),
    // Thin lines are hard to hit, so picking uses this wider, invisible band. Markers drawn later still win.
    new PathLayer<PipelinePath>({
      id: 'pipeline-hits',
      data: paths,
      visible: visibility.pipelines,
      pickable: true,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => Math.max(pipelineWidthPx(p.pipeline), PIPELINE_WIDTH.hitPx),
      getColor: [0, 0, 0, 0],
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer<PipelinePath>({
      id: 'pipelines',
      data: paths,
      visible: visibility.pipelines,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => pipelineWidthPx(p.pipeline),
      getColor: (p) => {
        const status = pipelineStatus(p.pipeline);
        const alpha =
          (status === 'operating' ? PIPELINE_WIDTH.operatingAlpha : 1) *
          (p.pipeline.geometryApprox ? PIPELINE_WIDTH.approxAlpha : 1) *
          statusAlpha(p.pipeline) *
          pipelineFade(p.pipeline.id);
        return withAlpha(statusColor(status, colors), alpha);
      },
      widthUnits: 'pixels',
      widthMinPixels: 1,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getColor: [colors, highlight, selection] },
    }),
    new PathLayer<PipelinePath>({
      id: 'pipeline-hover',
      data: hoveredPaths,
      visible: visibility.pipelines,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => pipelineWidthPx(p.pipeline),
      getColor: withAlpha(colors.selection, 0.5),
      widthUnits: 'pixels',
      widthMinPixels: 2,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getColor: [colors] },
    }),
    // Measured flow: a brighter inner line whose width is the flow's share of capacity (SPEC 5).
    new PathLayer<PipelinePath>({
      id: 'pipeline-flow',
      data: flowPaths,
      visible: visibility.pipelines,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => flowLineWidthPx(pipelineWidthPx(p.pipeline), pipelineShares.get(p.pipeline.id) ?? 0),
      getColor: colors.measuredFlow,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getWidth: [pipelineShares], getColor: [colors] },
    }),
    // Oil and gas fields (M13): a triangle colored by status, sized within oil or within gas, on a thin halo.
    // Above the lines, which often start at a field, so a field can still be picked; below the terminals.
    new ScatterplotLayer<Field>({
      id: 'field-selection',
      data: data.fields.filter((f) => isSelected('field', f.id)),
      visible: visibility.fields,
      getPosition: (f) => f.point,
      getRadius: (f) => fieldRadiusPx(f, scale) * 1.2 + FIELD_MARKER.selectionGapPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: colors.selection,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      updateTriggers: { getLineColor: [colors] },
    }),
    new IconLayer<Field>({
      id: 'field-halo',
      data: data.fields,
      visible: visibility.fields,
      getPosition: (f) => f.point,
      getIcon: () => TRIANGLE,
      getSize: (f) => fieldRadiusPx(f, scale) * 2 + FIELD_MARKER.haloPx,
      sizeUnits: 'pixels',
      getColor: (f) => withAlpha(colors.halo, fieldFade(f.id)),
      updateTriggers: { getColor: [colors, fieldHighlight, selection] },
    }),
    new IconLayer<Field>({
      id: 'fields',
      data: data.fields,
      visible: visibility.fields,
      pickable: true,
      getPosition: (f) => f.point,
      getIcon: () => TRIANGLE,
      getSize: (f) => fieldRadiusPx(f, scale) * 2,
      sizeUnits: 'pixels',
      getColor: (f) => withAlpha(statusColor(fieldStatus(f), colors), (fieldStatus(f) === 'operating' ? FIELD_MARKER.operatingAlpha : 1) * statusAlpha(f) * fieldFade(f.id)),
      autoHighlight: true,
      highlightColor: withAlpha(colors.selection, 0.5),
      updateTriggers: { getColor: [colors, fieldHighlight, selection] },
    }),
    // The fuel regions: a light fill to tap and an outline; the open region is drawn stronger.
    new GeoJsonLayer<UsRegion>({
      id: 'regions',
      data: regionCollection(data.usRegions),
      visible: regionsOnly,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f: Feature<Geometry, UsRegion>) =>
        withAlpha(colors.ink, isSelected('region', f.properties.id) ? REGION_OUTLINE.selectedFillAlpha : REGION_OUTLINE.fillAlpha),
      getLineColor: (f: Feature<Geometry, UsRegion>) =>
        isSelected('region', f.properties.id) ? colors.selection : withAlpha(colors.ink, REGION_OUTLINE.lineAlpha),
      getLineWidth: (f: Feature<Geometry, UsRegion>) =>
        isSelected('region', f.properties.id) ? REGION_OUTLINE.selectedLinePx : REGION_OUTLINE.linePx,
      lineWidthUnits: 'pixels',
      lineJointRounded: true,
      autoHighlight: true,
      highlightColor: colors.basinFillHover,
      updateTriggers: { getFillColor: [selection, colors], getLineColor: [selection, colors], getLineWidth: [selection] },
    }),
    new TextLayer<UsRegion>({
      id: 'region-labels',
      data: data.usRegions,
      visible: regionsOnly && zoom >= regionLabelMinZoom,
      getPosition: (r) => r.labelPoint,
      getText: (r) => r.name,
      getSize: REGION_OUTLINE.labelPx,
      getColor: colors.ink,
      fontFamily,
      fontWeight: 600,
      characterSet: 'auto',
      outlineWidth: 2,
      outlineColor: colors.halo,
      fontSettings: { sdf: true },
      updateTriggers: { getColor: [colors] },
    }),
    // Where a region's crude comes from: schematic arcs, width by share, foreign and domestic in two tones.
    new FlowArcLayer<OriginArc>({
      id: 'origin-arcs',
      animate: animateArcs,
      data: originArcs,
      getSourcePosition: (a) => a.from,
      getTargetPosition: (a) => a.to,
      getWidth: (a) => ORIGIN_ARC.minPx + Math.sqrt(a.share) * (ORIGIN_ARC.maxPx - ORIGIN_ARC.minPx),
      widthUnits: 'pixels',
      getSourceColor: (a) => withAlpha(a.kind === 'country' ? colors.arcForeign : colors.arcDomestic, 0.3),
      getTargetColor: (a) => withAlpha(a.kind === 'country' ? colors.arcForeign : colors.arcDomestic, 0.85),
      greatCircle: true,
      updateTriggers: { getSourceColor: [colors], getTargetColor: [colors] },
    }),
    // LNG terminals: a dot colored by status, area by capacity; import terminals have a hollow centre.
    new ScatterplotLayer<LngTerminal>({
      id: 'lng-selection',
      data: data.lngTerminals.filter((t) => isSelected('lng', t.id)),
      visible: visibility.lng,
      getPosition: (t) => t.point,
      getRadius: (t) => lngRadiusPx(t) + LNG_RADIUS.selectionGapPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: colors.selection,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      updateTriggers: { getLineColor: [colors] },
    }),
    new ScatterplotLayer<LngTerminal>({
      id: 'lng',
      data: data.lngTerminals,
      visible: visibility.lng,
      pickable: true,
      getPosition: (t) => t.point,
      getRadius: lngRadiusPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: true,
      getFillColor: (t) => withAlpha(statusColor(lngStatus(t), colors), statusAlpha(t) * lngFade(t.id)),
      getLineColor: (t) => withAlpha(colors.halo, lngFade(t.id)),
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: withAlpha(colors.selection, 0.5),
      updateTriggers: { getFillColor: [colors, highlight, selection], getLineColor: [colors, highlight, selection] },
    }),
    new ScatterplotLayer<LngTerminal>({
      id: 'lng-import-centres',
      data: importTerminals,
      visible: visibility.lng,
      getPosition: (t) => t.point,
      getRadius: (t) => lngRadiusPx(t) * LNG_RADIUS.centreShare,
      radiusUnits: 'pixels',
      getFillColor: (t) => withAlpha(colors.halo, lngFade(t.id)),
      updateTriggers: { getFillColor: [colors, highlight, selection] },
    }),
    // Refineries: a square colored by status, its side from crude distillation capacity, on a halo.
    new ScatterplotLayer<Refinery>({
      id: 'refinery-selection',
      data: data.refineries.filter((r) => isSelected('refinery', r.id)),
      visible: visibility.refineries,
      getPosition: (r) => r.point,
      getRadius: (r) => refineryRadiusPx(r) * Math.SQRT2 + REFINERY_RADIUS.selectionGapPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: colors.selection,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      updateTriggers: { getLineColor: [colors] },
    }),
    new IconLayer<Refinery>({
      id: 'refinery-halo',
      data: data.refineries,
      visible: visibility.refineries,
      getPosition: (r) => r.point,
      getIcon: () => SQUARE,
      getSize: (r) => refineryRadiusPx(r) * 2 + REFINERY_RADIUS.haloPx,
      sizeUnits: 'pixels',
      getColor: (r) => withAlpha(colors.halo, refineryFade(r.id)),
      updateTriggers: { getColor: [colors, highlight, selection] },
    }),
    new IconLayer<Refinery>({
      id: 'refineries',
      data: data.refineries,
      visible: visibility.refineries,
      pickable: true,
      getPosition: (r) => r.point,
      getIcon: () => SQUARE,
      getSize: (r) => refineryRadiusPx(r) * 2,
      sizeUnits: 'pixels',
      getColor: (r) => withAlpha(statusColor(refineryStatus(r), colors), statusAlpha(r) * refineryFade(r.id)),
      autoHighlight: true,
      highlightColor: withAlpha(colors.selection, 0.5),
      updateTriggers: { getColor: [colors, highlight, selection] },
    }),
    // Oil terminals: a diamond colored by the latest claim's status, on a halo that lifts it off the lines below.
    new ScatterplotLayer<OilTerminal>({
      id: 'terminal-selection',
      data: data.oilTerminals.filter((t) => isSelected('terminal', t.id)),
      visible: visibility.terminals,
      getPosition: (t) => t.point,
      getRadius: TERMINAL_MARKER.selectionRadiusPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: colors.selection,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      updateTriggers: { getLineColor: [colors] },
    }),
    new IconLayer<OilTerminal>({
      id: 'terminal-halo',
      data: data.oilTerminals,
      visible: visibility.terminals,
      getPosition: (t) => t.point,
      getIcon: () => DIAMOND,
      getSize: TERMINAL_MARKER.haloPx,
      sizeUnits: 'pixels',
      getColor: (t) => withAlpha(colors.halo, terminalFade(t.id)),
      updateTriggers: { getColor: [colors, highlight, selection] },
    }),
    new IconLayer<OilTerminal>({
      id: 'terminals',
      data: data.oilTerminals,
      visible: visibility.terminals,
      pickable: true,
      getPosition: (t) => t.point,
      getIcon: () => DIAMOND,
      getSize: TERMINAL_MARKER.sizePx,
      sizeUnits: 'pixels',
      getColor: (t) => withAlpha(statusColor(terminalStatus(t), colors), statusAlpha(t) * terminalFade(t.id)),
      autoHighlight: true,
      highlightColor: withAlpha(colors.selection, 0.5),
      updateTriggers: { getColor: [colors, highlight, selection] },
    }),
    // Halo separates the ring from pipelines passing underneath.
    new ScatterplotLayer<Chokepoint>({
      id: 'chokepoint-halo',
      data: data.chokepoints,
      visible: visibility.chokepoints,
      getPosition: (c) => c.point,
      getRadius: chokepointRadiusPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: true,
      getFillColor: colors.halo,
      getLineColor: colors.halo,
      getLineWidth: CHOKEPOINT_RADIUS.haloPx,
      lineWidthUnits: 'pixels',
      updateTriggers: { getFillColor: [colors], getLineColor: [colors] },
    }),
    // Inner disk: area is flow relative to the five-year average (full ring = at baseline).
    new ScatterplotLayer<Chokepoint>({
      id: 'chokepoint-flow',
      data: data.chokepoints,
      visible: visibility.chokepoints,
      getPosition: (c) => c.point,
      getRadius: (c) => {
        const flow = flows.get(c.id);
        return flowFillRadiusPx(chokepointRadiusPx(c), flow ? (flow.indexFiveYear ?? flow.indexTrailing) : null);
      },
      radiusUnits: 'pixels',
      getFillColor: (c) => withAlpha(bandColor(flows.get(c.id)?.band, colors), 0.6 * chokepointFade(c.id)),
      updateTriggers: { getRadius: [flows], getFillColor: [flows, colors, highlight, selection] },
    }),
    new ScatterplotLayer<Chokepoint>({
      id: 'chokepoints',
      data: data.chokepoints,
      visible: visibility.chokepoints,
      pickable: true,
      getPosition: (c) => c.point,
      getRadius: chokepointRadiusPx,
      radiusUnits: 'pixels',
      stroked: true,
      filled: true,
      getFillColor: (c) => withAlpha(colors.ink, isSelected('chokepoint', c.id) ? 0.12 : 0.03),
      getLineColor: (c) => withAlpha(bandColor(flows.get(c.id)?.band, colors), chokepointFade(c.id)),
      getLineWidth: (c) => (isSelected('chokepoint', c.id) ? 3.5 : 2.5),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: withAlpha(colors.ink, 0.15),
      updateTriggers: {
        getFillColor: [selection, colors],
        getLineColor: [flows, colors, highlight, selection],
        getLineWidth: [selection],
      },
    }),
    new ScatterplotLayer<Chokepoint>({
      id: 'chokepoint-centers',
      data: data.chokepoints,
      visible: visibility.chokepoints,
      getPosition: (c) => c.point,
      getRadius: 1.5,
      radiusUnits: 'pixels',
      getFillColor: colors.ink,
      updateTriggers: { getFillColor: [colors] },
    }),
  ];
}

/** Turns a deck.gl pick into a typed object, by layer id. */
export function toPicked(layerId: string | undefined, object: unknown): PickedObject | null {
  if (!object) return null;
  switch (layerId) {
    case 'basins':
      return { kind: 'basin', item: (object as Feature<Polygon | MultiPolygon, Basin>).properties };
    case 'shale':
      return { kind: 'shale', item: (object as Feature<Polygon | MultiPolygon, ShalePlay>).properties };
    case 'pipeline-hits':
      return { kind: 'pipeline', item: (object as PipelinePath).pipeline };
    case 'chokepoints':
      return { kind: 'chokepoint', item: object as Chokepoint };
    case 'storage':
      return { kind: 'country', item: (object as Feature<Polygon | MultiPolygon, Country>).properties };
    case 'lng':
      return { kind: 'lng', item: object as LngTerminal };
    case 'terminals':
      return { kind: 'terminal', item: object as OilTerminal };
    case 'refineries':
      return { kind: 'refinery', item: object as Refinery };
    case 'fields':
      return { kind: 'field', item: object as Field };
    case 'regions':
      return { kind: 'region', item: (object as Feature<Polygon | MultiPolygon, UsRegion>).properties };
    default:
      return null;
  }
}

/** The id a picked item has in the URL. Country codes are uppercase ISO, URL ids lowercase. */
export function selectionId(picked: PickedObject): string {
  return picked.kind === 'country' ? picked.item.id.toLowerCase() : picked.item.id;
}
