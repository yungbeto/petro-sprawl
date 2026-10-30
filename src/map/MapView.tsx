import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  BASEMAP_STYLES,
  BASIN_LABEL_MIN_ZOOM,
  EIA_REFERENCE_YEAR,
  FIT_PADDING,
  POINT_FOCUS_ZOOM,
  THEATER_BOUNDS,
} from '../lib/config';
import type { Theme } from '../lib/theme';
import type { Camera, Selection } from '../app/urlState';
import { chokepointFlows, fuelOriginsFor, originsFor, regionHighlight, resolveSelection, seriesById, type Datasets } from '../lib/data';
import type { RegionFuel } from '../lib/config';
import { originArcs, type OriginArc } from '../lib/oilOrigins';
import { pipelineFlow } from '../lib/evidence';
import { storageFills } from '../lib/gasStorage';
import type { ChokepointFlow } from '../lib/flow';
import { boundsOf } from '../lib/geo';
import { formatCapacity, formatIndexShare, formatMbd, formatNumber } from '../lib/format';
import type { FilterMatches } from '../lib/filters';
import { terminalStatus } from '../lib/encoding';
import { statusLabel } from '../panel/details';
import { buildLayers, selectionId, toPicked, type LayerVisibility, type PickedObject } from './layers';
import { readMapColors, type MapColors } from './colors';

// MapLibre finds its worker relative to its own module URL, which Vite's dependency
// pre-bundling and production bundling both break. Point it at an emitted asset instead.
maplibregl.setWorkerUrl(workerUrl);

const LABEL_FONT = 'Inter';

/** Move the camera to a selection, or frame a set of points (a view opening). */
export type FocusRequest = { selection: Selection; nonce: number } | { points: [number, number][]; nonce: number };

interface MapViewProps {
  theme: Theme;
  initialCamera: Camera | null;
  onCameraChange: (camera: Camera) => void;
  data: Datasets;
  visibility: LayerVisibility;
  selection: Selection | null;
  /** The fuel an open region shows: its arcs follow it. */
  fuel: RegionFuel;
  /** Assets matching the active quick filter; everything else fades. Null shows all. */
  highlight: FilterMatches | null;
  onSelect: (selection: Selection) => void;
  focus: FocusRequest | null;
  children?: ReactNode;
}

interface Hover {
  picked: PickedObject;
  x: number;
  y: number;
}

function tooltipFigure(picked: PickedObject, flows: Map<string, ChokepointFlow>, fills: Map<string, number>): string {
  switch (picked.kind) {
    case 'chokepoint': {
      const index = flows.get(picked.item.id)?.indexFiveYear;
      return index != null
        ? `Tankers at ${formatIndexShare(index)} of five-year average`
        : `${formatMbd(picked.item.eiaReferenceMbd)} · EIA ${EIA_REFERENCE_YEAR}`;
    }
    case 'basin':
      return [
        picked.item.provinceType === 'priority' ? 'Priority province' : 'Boutique province',
        picked.item.dominant,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'pipeline':
      return picked.item.capacity ? formatCapacity(picked.item.capacity) : 'Capacity unknown';
    case 'lng': {
      const { operating, planned } = picked.item.capacityMtpa;
      const facility = picked.item.facility === 'export' ? 'Export' : 'Import';
      return operating
        ? `${facility} · ${formatNumber(operating, 1)} mtpa operating`
        : planned
          ? `${facility} · ${formatNumber(planned, 1)} mtpa planned`
          : `${facility} · capacity unknown`;
    }
    case 'terminal': {
      const role = picked.item.role === 'export' ? 'Export terminal' : 'Import terminal';
      return `${role} · ${statusLabel(terminalStatus(picked.item)).toLowerCase()}`;
    }
    case 'storage': {
      const fill = fills.get(picked.item.id);
      return fill != null ? `Storage ${formatNumber(fill, 1)}% full` : 'No storage data';
    }
  }
}

/** Stable empty arcs, so the arc layer keeps its data between rebuilds outside a region view. */
const NO_ARCS: OriginArc[] = [];

export function MapView(props: MapViewProps) {
  const { theme, initialCamera, data, visibility, selection, fuel, highlight, focus } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const appliedThemeRef = useRef<Theme>(theme);
  const callbacksRef = useRef(props);
  callbacksRef.current = props;

  const [colors, setColors] = useState<MapColors | null>(null);
  const [zoom, setZoom] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const flows = useMemo(() => chokepointFlows(data), [data]);
  const pipelineShares = useMemo(() => {
    const shares = new Map<string, number>();
    for (const p of data.pipelines) {
      const share = pipelineFlow(seriesById(data, p.flowSeriesId))?.share;
      if (share != null) shares.set(p.id, share);
    }
    return shares;
  }, [data]);
  const fills = useMemo(() => storageFills(data.series, data.countries), [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const camera = initialCamera
      ? { center: [initialCamera.lon, initialCamera.lat] as [number, number], zoom: initialCamera.zoom }
      : { bounds: THEATER_BOUNDS, fitBoundsOptions: { padding: 24 } };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[appliedThemeRef.current],
      ...camera,
      dragRotate: false,
      pitchWithRotate: false,
      // Only the basemap's credit stays on the map; data sources are on the About page in the menu.
      attributionControl: { compact: false },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    // A hover tooltip would point at the wrong place once the camera moves. Deck can also
    // re-pick mid-flight as features pass under a still cursor, so clear again at the end.
    map.on('movestart', () => setHover(null));
    map.on('moveend', () => {
      setHover(null);
      const center = map.getCenter();
      setZoom(map.getZoom());
      callbacksRef.current.onCameraChange({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
    });
    setZoom(map.getZoom());

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info) => {
        const picked = toPicked(info.layer?.id, info.object);
        map.getCanvas().style.cursor = picked ? 'pointer' : '';
        setHover(picked ? { picked, x: info.x, y: info.y } : null);
      },
      onClick: (info) => {
        const picked = toPicked(info.layer?.id, info.object);
        if (picked) callbacksRef.current.onSelect({ kind: picked.kind, id: selectionId(picked) });
      },
    });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;
    if (import.meta.env.DEV) (window as unknown as { __etMap?: maplibregl.Map }).__etMap = map;

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // The initial camera is read once; later camera changes come from the map itself.
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`11px "${LABEL_FONT}"`).finally(() => !cancelled && setFontsReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Theme tokens are applied in a layout effect, so they are current here.
  useEffect(() => {
    setColors(readMapColors());
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    map.setStyle(BASEMAP_STYLES[theme], { diff: false });
  }, [theme]);

  // A region view draws the arcs for its fuel. On crude it keeps the chokepoints and terminals on cited
  // routes bright; refined fuels have no routes yet, so everything else dims.
  const regionView = useMemo(() => {
    const resolved = selection?.kind === 'region' ? resolveSelection(selection, data) : null;
    if (resolved?.kind !== 'region' || !data.usLookup) return null;
    if (fuel !== 'crude') {
      const origins = fuelOriginsFor(data, resolved.item.id, fuel);
      return origins ? { arcs: originArcs(origins, resolved.item.id, data.usLookup), highlight: regionHighlight(null) } : null;
    }
    const origins = originsFor(data, resolved.item);
    return origins ? { arcs: originArcs(origins, resolved.item.id, data.usLookup), highlight: regionHighlight(origins) } : null;
  }, [selection, fuel, data]);

  // An id, not the hover itself, so moving along one pipeline doesn't rebuild the layers.
  const hoveredPipelineId = hover?.picked.kind === 'pipeline' ? hover.picked.item.id : null;

  useEffect(() => {
    if (!overlayRef.current || !colors) return;
    overlayRef.current.setProps({
      layers: buildLayers({
        data,
        flows,
        pipelineShares,
        storageFills: fills,
        visibility,
        selection,
        highlight: regionView?.highlight ?? highlight,
        hoveredPipelineId,
        originArcs: regionView?.arcs ?? NO_ARCS,
        colors,
        zoom,
        basinLabelMinZoom: fontsReady ? BASIN_LABEL_MIN_ZOOM : Infinity,
        fontFamily: `"${LABEL_FONT}", sans-serif`,
      }),
    });
  }, [data, flows, pipelineShares, fills, visibility, selection, highlight, regionView, hoveredPipelineId, colors, zoom, fontsReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if ('points' in focus) {
      if (focus.points.length) map.fitBounds(boundsOf({ type: 'MultiPoint', coordinates: focus.points }), { padding: FIT_PADDING, maxZoom: 5 });
      return;
    }
    const resolved = resolveSelection(focus.selection, data);
    if (!resolved) return;
    if (resolved.kind === 'chokepoint' || resolved.kind === 'lng' || resolved.kind === 'terminal') {
      map.flyTo({ center: resolved.item.point, zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM) });
    } else if (resolved.kind === 'region') {
      const points = regionView?.arcs.flatMap((a) => [a.from, a.to]) ?? [];
      if (points.length) map.fitBounds(boundsOf({ type: 'MultiPoint', coordinates: points }), { padding: FIT_PADDING, maxZoom: 5 });
    } else {
      map.fitBounds(boundsOf(resolved.item.geometry), { padding: FIT_PADDING, maxZoom: 8 });
    }
    // Only a new focus request moves the camera, not data or selection changes.
  }, [focus]);

  // Switching a region's fuel changes its arcs (gasoline is mostly domestic, crude global), so reframe.
  const framedFuel = useRef(fuel);
  useEffect(() => {
    const map = mapRef.current;
    if (framedFuel.current === fuel) return;
    framedFuel.current = fuel;
    const points = regionView?.arcs.flatMap((a) => [a.from, a.to]) ?? [];
    if (map && points.length) map.fitBounds(boundsOf({ type: 'MultiPoint', coordinates: points }), { padding: FIT_PADDING, maxZoom: 5 });
  }, [fuel, regionView]);

  return (
    <div className="map" role="region" aria-label="Map">
      <div ref={containerRef} className="map__canvas" />
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <span className="map-tooltip__name">{hover.picked.item.name}</span>
          <span className="map-tooltip__figure mono">{tooltipFigure(hover.picked, flows, fills)}</span>
        </div>
      )}
      {props.children}
    </div>
  );
}
