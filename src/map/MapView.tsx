import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BASEMAP_STYLES, THEATER_BOUNDS } from '../lib/config';
import type { Theme } from '../lib/theme';
import type { Camera } from '../app/urlState';

// MapLibre finds its worker relative to its own module URL, which Vite's dependency
// pre-bundling and production bundling both break. Point it at an emitted asset instead.
maplibregl.setWorkerUrl(workerUrl);

interface MapViewProps {
  theme: Theme;
  initialCamera: Camera | null;
  onCameraChange: (camera: Camera) => void;
}

export function MapView({ theme, initialCamera, onCameraChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const appliedThemeRef = useRef<Theme>(theme);
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;

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
      attributionControl: { compact: false },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.on('moveend', () => {
      const center = map.getCenter();
      onCameraChangeRef.current({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The initial camera is read once; later camera changes come from the map itself.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    map.setStyle(BASEMAP_STYLES[theme], { diff: false });
  }, [theme]);

  return <div ref={containerRef} className="map" role="region" aria-label="Map" />;
}
