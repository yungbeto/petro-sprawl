import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  BASEMAP_STYLES,
  BASIN_FOCUS, BASIN_LABEL_MIN_ZOOM,
  EIA_REFERENCE_YEAR,
  FIT_PADDING,
  MOBILE,
  PADDS,
  POINT_FOCUS_ZOOM,
  REGION_OUTLINE,
  THEATER_BOUNDS,
} from '../lib/config';
import type { Theme } from '../lib/theme';
import type { Camera, Selection } from '../app/urlState';
import { chokepointFlows, fuelOriginsFor, originsFor, regionHighlight, resolveSelection, seriesById, type Datasets } from '../lib/data';
import type { RegionFuel } from '../lib/config';
import { originArcs, type OriginArc } from '../lib/oilOrigins';
import { pipelineFlow } from '../lib/evidence';
import { storageByCountry, type CountryStorage } from '../lib/gasStorage';
import type { ChokepointFlow } from '../lib/flow';
import { boundsOf } from '../lib/geo';
import { formatShaleValue, formationById, latestMonth, shaleSeries } from '../lib/shale';
import { formatCapacity, formatIndexShare, formatMbd, formatMonth, formatNumber, formatRefineryCapacity, formatShare, formatSignedPct } from '../lib/format';
import type { FilterMatches } from '../lib/filters';
import { refineryStatus, terminalStatus } from '../lib/encoding';
import { fieldLead, fieldScale, fieldStatus, formatFieldOutput } from '../lib/fields';
import { statusLabel } from '../panel/details';
import { buildLayers, selectionId, toPicked, type CountryMode, type LayerVisibility, type PickedObject } from './layers';
import { countryArcs, countryHighlight, countryOrigins, importPeriod, originsOfCountry } from '../lib/crudeImports';
import { readMapColors, type MapColors } from './colors';

// MapLibre finds its worker relative to its own module URL, which Vite's dependency
// pre-bundling and production bundling both break. Point it at an emitted asset instead.
maplibregl.setWorkerUrl(workerUrl);

const LABEL_FONT = 'Inter';

/** Move the camera to a selection, frame a set of points (a view opening), or return to a camera (Back, Close). */
export type FocusRequest =
  | { selection: Selection; nonce: number }
  | { points: [number, number][]; nonce: number }
  | { camera: Camera; nonce: number };

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
  /** Draw only these pipelines; null draws them all. */
  onlyPipelines: Set<string> | null;
  /** Fields kept bright (an open group's, or none under a quick filter); null keeps them all. */
  fieldHighlight: Set<string> | null;
  /** The fuel origins surface or a region view: only the region outlines (and a region's arcs) show. */
  regionsOnly: boolean;
  /** The basins surface: the outlines drawn stronger and named sooner. */
  basinsFocus: boolean;
  /** What the country layer shows: storage against last year, or (on oil origins) the importers, with an open country's arcs. */
  countryMode: CountryMode;
  onSelect: (selection: Selection) => void;
  focus: FocusRequest | null;
  /** On phones, the search bar and chips above and the sheet below: the camera frames what's between. */
  insets?: { top: number; bottom: number } | null;
  children?: ReactNode;
}

interface Hover {
  picked: PickedObject;
  x: number;
  y: number;
}

function tooltipFigure(
  picked: PickedObject,
  flows: Map<string, ChokepointFlow>,
  storage: Map<string, CountryStorage>,
  { countryMode, data }: { countryMode: CountryMode; data: Datasets },
): string {
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
    case 'shale': {
      // EIA's figure is the formation's, shared by its outlines: say so by naming it.
      const formation = formationById(picked.item.formation);
      const series = formation && 'oil' in formation ? shaleSeries(data, formation.oil) : formation && 'gas' in formation ? shaleSeries(data, formation.gas) : undefined;
      const latest = latestMonth(series);
      if (!formation || !series || !latest) return `${picked.item.basin} basin · no EIA formation figure`;
      return `${formation.label}: ${formatShaleValue(series, latest.value)} ${series.kind === 'oil' ? 'mb/d' : 'billion ft³/d'} · ${formatMonth(latest.period)}`;
    }
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
    case 'refinery': {
      const status = statusLabel(refineryStatus(picked.item)).toLowerCase();
      return picked.item.capacity ? `${formatRefineryCapacity(picked.item.capacity)} · ${status}` : `Capacity unknown · ${status}`;
    }
    case 'field': {
      const status = statusLabel(fieldStatus(picked.item)).toLowerCase();
      const lead = fieldLead(picked.item, fieldScale(data.fields))?.output;
      return lead ? `${formatFieldOutput(lead)}${lead.year ? `, ${lead.year}` : ''} · ${status}` : `No figure from GEM · ${status}`;
    }
    case 'region': {
      const states = PADDS.find((p) => p.id === picked.item.id)?.states.length;
      return `PADD ${picked.item.id.slice(-1)}${states ? ` · ${states} states` : ''}`;
    }
    case 'country': {
      if (countryMode === 'imports') {
        const record = data.crudeImports.find((r) => r.id === picked.item.id);
        if (!record) return 'No crude import data';
        const largest = countryOrigins(record).rows.find((r) => r.kind === 'country');
        return largest ? `Largest source ${largest.label}, ${formatShare(largest.share)} · ${importPeriod(record)}` : `Sources not named · ${importPeriod(record)}`;
      }
      const s = storage.get(picked.item.id);
      if (!s) return 'No regular storage data';
      const vs = s.vsLastYearPct !== null ? `${formatSignedPct(s.vsLastYearPct)} vs last year` : 'Nothing to compare last year';
      return `${s.fill !== null ? `${formatNumber(s.fill, 1)}% full · ` : ''}${vs} · ${s.summary.latest.date}`;
    }
  }
}

/** Fit padding: phones have little map left between the search bar and the sheet. */
const fitPadding = () => (window.matchMedia(`(max-width: ${MOBILE.maxWidthPx}px)`).matches ? MOBILE.fitPaddingPx : FIT_PADDING);

/** Stable empty arcs, so the arc layer keeps its data between rebuilds outside a region view. */
const NO_ARCS: OriginArc[] = [];

export function MapView(props: MapViewProps) {
  const { theme, initialCamera, data, visibility, selection, fuel, highlight, fieldHighlight, onlyPipelines, regionsOnly, basinsFocus, countryMode, focus } = props;
  // The origin arcs' pulses stop under reduced motion, and start again if it's switched off.
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const appliedThemeRef = useRef<Theme>(theme);
  const callbacksRef = useRef(props);
  callbacksRef.current = props;
  /** What the camera last framed, until the map is moved by hand. */
  const framed = useRef<FocusRequest | null>(null);

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
  const storage = useMemo(() => storageByCountry(data.series), [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const camera = initialCamera
      ? { center: [initialCamera.lon, initialCamera.lat] as [number, number], zoom: initialCamera.zoom }
      : { bounds: THEATER_BOUNDS, fitBoundsOptions: { padding: 24 } };

    // Phones draw at no more than MOBILE.maxPixelRatio; the basemap and the overlay agree.
    const phone = window.matchMedia(`(max-width: ${MOBILE.maxWidthPx}px)`).matches;
    const pixelRatio = phone ? Math.min(window.devicePixelRatio, MOBILE.maxPixelRatio) : window.devicePixelRatio;
    const map = new maplibregl.Map({
      container: containerRef.current,
      pixelRatio,
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
    map.on('movestart', (e) => {
      setHover(null);
      // A pan, pinch, wheel or key: the reader has the map now, so a new sheet height won't reframe.
      if (e.originalEvent) framed.current = null;
    });
    map.on('moveend', () => {
      setHover(null);
      const center = map.getCenter();
      setZoom(map.getZoom());
      callbacksRef.current.onCameraChange({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
    });
    setZoom(map.getZoom());

    const overlay = new MapboxOverlay({
      interleaved: false,
      useDevicePixels: pixelRatio,
      layers: [],
      onHover: (info) => {
        // Touch has no hover: a pick on every move of a pan would only cost frames.
        if (phone) return;
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

  // On oil origins, an open country draws arcs from its partners and keeps its routes' chokepoints bright.
  const countryView = useMemo(() => {
    if (countryMode !== 'imports' || selection?.kind !== 'country' || !data.usLookup) return null;
    const origins = originsOfCountry(data, selection.id.toUpperCase());
    return origins ? { arcs: countryArcs(origins, data.usLookup.countryPoints), highlight: countryHighlight(origins) } : null;
  }, [countryMode, selection, data]);
  const originView = regionView ?? countryView;
  const importers = useMemo(() => new Set(data.crudeImports.map((r) => r.id)), [data]);

  // A region frames its own states and where its fuel comes from.
  const regionFrame = useMemo(() => {
    const outline = selection?.kind === 'region' ? data.usRegions.find((r) => r.id === selection.id)?.frame ?? [] : [];
    return [...outline, ...(regionView?.arcs.flatMap((a) => [a.from, a.to]) ?? [])];
  }, [selection, data, regionView]);

  // An id, not the hover itself, so moving along one pipeline doesn't rebuild the layers.
  const hoveredPipelineId = hover?.picked.kind === 'pipeline' ? hover.picked.item.id : null;

  useEffect(() => {
    if (!overlayRef.current || !colors) return;
    overlayRef.current.setProps({
      layers: buildLayers({
        data,
        flows,
        pipelineShares,
        storage,
        visibility,
        selection,
        highlight: originView?.highlight ?? highlight,
        hoveredPipelineId,
        onlyPipelines,
        fieldHighlight,
        originArcs: originView?.arcs ?? NO_ARCS,
        animateArcs: !reducedMotion,
        countryMode,
        importers,
        regionsOnly,
        basinsFocus,
        regionLabelMinZoom: fontsReady ? REGION_OUTLINE.labelMinZoom : Infinity,
        colors,
        zoom,
        basinLabelMinZoom: fontsReady ? (basinsFocus ? BASIN_FOCUS.labelMinZoom : BASIN_LABEL_MIN_ZOOM) : Infinity,
        fontFamily: `"${LABEL_FONT}", sans-serif`,
      }),
    });
  }, [data, flows, pipelineShares, storage, visibility, selection, highlight, fieldHighlight, onlyPipelines, regionsOnly, basinsFocus, originView, countryMode, importers, hoveredPipelineId, colors, zoom, fontsReady, reducedMotion]);

  // The camera frames the open item, or a surface, in the map left showing between the search bar and
  // chips above and the sheet below. While the map hasn't been moved by hand since, a new sheet height
  // frames it again, so it stays whole and centred as the sheet rises and falls; after a pan or a zoom,
  // a new height only shifts the centre into the part showing.
  const insetTop = props.insets?.top ?? 0;
  const insetBottom = props.insets?.bottom ?? 0;
  const lastFocus = useRef<FocusRequest | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focus && focus !== lastFocus.current) {
      lastFocus.current = focus;
      framed.current = focus;
    }
    // At full the sheet leaves only a sliver of map: hold still until it comes down.
    if (map.getContainer().clientHeight - insetTop - insetBottom < MOBILE.minFramePx) return;
    const padding = { top: insetTop, bottom: insetBottom, left: 0, right: 0 };
    const target = framed.current;
    if (!target) {
      map.easeTo({ padding, duration: 240 });
      return;
    }
    const fit = (points: [number, number][], maxZoom: number) => {
      if (!points.length) return;
      const p = fitPadding();
      map.fitBounds(boundsOf({ type: 'MultiPoint', coordinates: points }), {
        padding: { top: insetTop + p, bottom: insetBottom + p, left: p, right: p },
        absolutePadding: true,
        maxZoom,
      });
    };
    if ('camera' in target) {
      map.flyTo({ center: [target.camera.lon, target.camera.lat], zoom: target.camera.zoom, padding });
      return;
    }
    if ('points' in target) {
      fit(target.points, 5);
      return;
    }
    const resolved = resolveSelection(target.selection, data);
    if (!resolved) return;
    if (resolved.kind === 'chokepoint' || resolved.kind === 'lng' || resolved.kind === 'terminal' || resolved.kind === 'refinery' || resolved.kind === 'field') {
      map.flyTo({ center: resolved.item.point, zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM), padding });
    } else if (resolved.kind === 'country' && countryView?.arcs.length) {
      // The country and every partner it draws an arc from.
      fit([...boundsOf(resolved.item.geometry), ...countryView.arcs.map((a) => a.from)], 5);
    } else if (resolved.kind === 'region') {
      fit(regionFrame, 5);
    } else {
      fit(boundsOf(resolved.item.geometry), 8);
    }
    // Only a new focus request or a new sheet height moves the camera, not data or selection changes.
  }, [focus, insetTop, insetBottom]);

  // Switching a region's fuel changes its arcs (gasoline is mostly domestic, crude global), so reframe.
  const framedFuel = useRef(fuel);
  useEffect(() => {
    const map = mapRef.current;
    if (framedFuel.current === fuel) return;
    framedFuel.current = fuel;
    if (!map || !regionFrame.length) return;
    const p = fitPadding();
    map.fitBounds(boundsOf({ type: 'MultiPoint', coordinates: regionFrame }), {
      padding: { top: insetTop + p, bottom: insetBottom + p, left: p, right: p },
      absolutePadding: true,
      maxZoom: 5,
    });
  }, [fuel, regionFrame]);

  return (
    <div className="map" role="region" aria-label="Map">
      <div ref={containerRef} className="map__canvas" />
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <span className="map-tooltip__name">{hover.picked.item.name}</span>
          <span className="map-tooltip__figure mono">{tooltipFigure(hover.picked, flows, storage, { countryMode, data })}</span>
        </div>
      )}
      {props.children}
    </div>
  );
}
