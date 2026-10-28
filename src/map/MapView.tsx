import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  BASEMAP_STYLES,
  BASIN_LABEL_MIN_ZOOM,
  EIA_REFERENCE_YEAR,
  FIT_PADDING,
  MAP_ATTRIBUTION,
  POINT_FOCUS_ZOOM,
  THEATER_BOUNDS,
} from '../lib/config';
import type { Theme } from '../lib/theme';
import type { Camera, Selection } from '../app/urlState';
import { resolveSelection, type Datasets } from '../lib/data';
import { boundsOf } from '../lib/geo';
import { formatCapacity, formatMbd } from '../lib/format';
import { buildLayers, toPicked, type LayerVisibility, type PickedObject } from './layers';
import { readMapColors, type MapColors } from './colors';

// MapLibre finds its worker relative to its own module URL, which Vite's dependency
// pre-bundling and production bundling both break. Point it at an emitted asset instead.
maplibregl.setWorkerUrl(workerUrl);

const LABEL_FONT = 'IBM Plex Sans';

export interface FocusRequest {
  selection: Selection;
  nonce: number;
}

interface MapViewProps {
  theme: Theme;
  initialCamera: Camera | null;
  onCameraChange: (camera: Camera) => void;
  data: Datasets;
  visibility: LayerVisibility;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  focus: FocusRequest | null;
  children?: ReactNode;
}

interface Hover {
  picked: PickedObject;
  x: number;
  y: number;
}

function tooltipFigure(picked: PickedObject): string {
  switch (picked.kind) {
    case 'chokepoint':
      return `${formatMbd(picked.item.eiaReferenceMbd)} · EIA ${EIA_REFERENCE_YEAR}`;
    case 'basin':
      return [
        picked.item.provinceType === 'priority' ? 'Priority province' : 'Boutique province',
        picked.item.dominant,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'pipeline':
      return picked.item.capacity ? formatCapacity(picked.item.capacity) : 'Capacity unknown';
  }
}

export function MapView(props: MapViewProps) {
  const { theme, initialCamera, data, visibility, selection, focus } = props;
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
      attributionControl: { compact: false, customAttribution: MAP_ATTRIBUTION },
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
        if (picked) callbacksRef.current.onSelect({ kind: picked.kind, id: picked.item.id });
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

  useEffect(() => {
    if (!overlayRef.current || !colors) return;
    overlayRef.current.setProps({
      layers: buildLayers({
        data,
        visibility,
        selection,
        colors,
        zoom,
        basinLabelMinZoom: fontsReady ? BASIN_LABEL_MIN_ZOOM : Infinity,
        fontFamily: `"${LABEL_FONT}", sans-serif`,
      }),
    });
  }, [data, visibility, selection, colors, zoom, fontsReady]);

  useEffect(() => {
    const map = mapRef.current;
    const resolved = focus && resolveSelection(focus.selection, data);
    if (!map || !resolved) return;
    if (resolved.kind === 'chokepoint') {
      map.flyTo({ center: resolved.item.point, zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM) });
    } else {
      map.fitBounds(boundsOf(resolved.item.geometry), { padding: FIT_PADDING, maxZoom: 8 });
    }
    // Only a new focus request moves the camera, not data or selection changes.
  }, [focus]);

  return (
    <div className="map" role="region" aria-label="Map">
      <div ref={containerRef} className="map__canvas" />
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <span className="map-tooltip__name">{hover.picked.item.name}</span>
          <span className="map-tooltip__figure mono">{tooltipFigure(hover.picked)}</span>
        </div>
      )}
      {props.children}
    </div>
  );
}
