import { GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import type { Layer } from '@deck.gl/core';
import type { AssetStatus, Basin, Chokepoint, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { CHOKEPOINT_RADIUS, PIPELINE_WIDTH } from '../lib/config';
import { chokepointRadiusPx, flowFillRadiusPx, pipelineStatus, pipelineWidthPx } from '../lib/encoding';
import type { ChokepointFlow, FlowBand } from '../lib/flow';
import { withAlpha } from '../lib/color';
import type { MapColors } from './colors';

export type LayerId = 'basins' | 'pipelines' | 'chokepoints';
export type LayerVisibility = Record<LayerId, boolean>;

export type PickedObject =
  | { kind: 'basin'; item: Basin }
  | { kind: 'pipeline'; item: Pipeline }
  | { kind: 'chokepoint'; item: Chokepoint };

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

function pipelinePaths(pipelines: Pipeline[]): PipelinePath[] {
  return pipelines.flatMap((pipeline) =>
    pipeline.geometry.type === 'LineString'
      ? [{ pipeline, path: pipeline.geometry.coordinates }]
      : pipeline.geometry.coordinates.map((path) => ({ pipeline, path })),
  );
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
  visibility: LayerVisibility;
  selection: Selection | null;
  colors: MapColors;
  zoom: number;
  basinLabelMinZoom: number;
  fontFamily: string;
}

export function buildLayers({
  data,
  flows,
  visibility,
  selection,
  colors,
  zoom,
  basinLabelMinZoom,
  fontFamily,
}: BuildLayersInput): Layer[] {
  const isSelected = (kind: Selection['kind'], id: string) => selection?.kind === kind && selection.id === id;

  const basinFeatures: FeatureCollection<Polygon | MultiPolygon, Basin> = {
    type: 'FeatureCollection',
    features: data.basins.map((basin) => ({ type: 'Feature', geometry: basin.geometry, properties: basin })),
  };
  const paths = pipelinePaths(data.pipelines);
  const selectedPaths = paths.filter((p) => isSelected('pipeline', p.pipeline.id));

  return [
    new GeoJsonLayer<Basin>({
      id: 'basins',
      data: basinFeatures,
      visible: visibility.basins,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: [0, 0, 0, 0],
      getLineColor: (f: Feature<Geometry, Basin>) =>
        isSelected('basin', f.properties.id) ? colors.selection : colors.basinLine,
      getLineWidth: (f: Feature<Geometry, Basin>) => (isSelected('basin', f.properties.id) ? 2 : 1),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: colors.basinFillHover,
      updateTriggers: { getLineColor: [selection, colors], getLineWidth: [selection] },
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
    new PathLayer<PipelinePath>({
      id: 'pipelines',
      data: paths,
      visible: visibility.pipelines,
      pickable: true,
      getPath: (p) => p.path as [number, number][],
      getWidth: (p) => pipelineWidthPx(p.pipeline),
      getColor: (p) => {
        const status = pipelineStatus(p.pipeline);
        const alpha =
          (status === 'operating' ? PIPELINE_WIDTH.operatingAlpha : 1) *
          (p.pipeline.geometryApprox ? PIPELINE_WIDTH.approxAlpha : 1);
        return withAlpha(statusColor(status, colors), alpha);
      },
      widthUnits: 'pixels',
      widthMinPixels: 1,
      capRounded: true,
      jointRounded: true,
      autoHighlight: true,
      highlightColor: withAlpha(colors.selection, 0.5),
      updateTriggers: { getColor: [colors] },
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
      getFillColor: (c) => withAlpha(bandColor(flows.get(c.id)?.band, colors), 0.6),
      updateTriggers: { getRadius: [flows], getFillColor: [flows, colors] },
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
      getLineColor: (c) => bandColor(flows.get(c.id)?.band, colors),
      getLineWidth: (c) => (isSelected('chokepoint', c.id) ? 3.5 : 2.5),
      lineWidthUnits: 'pixels',
      autoHighlight: true,
      highlightColor: withAlpha(colors.ink, 0.15),
      updateTriggers: {
        getFillColor: [selection, colors],
        getLineColor: [flows, colors],
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
    case 'pipelines':
      return { kind: 'pipeline', item: (object as PipelinePath).pipeline };
    case 'chokepoints':
      return { kind: 'chokepoint', item: object as Chokepoint };
    default:
      return null;
  }
}
