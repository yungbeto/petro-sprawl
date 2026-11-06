// Share cards: what a shared link shows in a chat or a post (its title, a fact or two with their source,
// and a globe turned to the place). Built for every page at build time (jobs/build-share-index.ts), looked
// up by the link preview functions (api/). Every fact is one the page itself shows.

import type { Geometry, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { Evidence } from '../types';
import type { Selection, SelectionKind } from '../app/urlState';
import { DEFAULT_REGION_FUEL, GLOBE, REGION_FUEL_LABELS, REGION_FUELS, SHARE, STORAGE_SOURCES, type RegionFuel } from './config';
import { countryOrigins, importPeriod } from './crudeImports';
import { chokepointFlow } from './flow';
import { fuelOriginsFor, originsFor, seriesById, type Datasets } from './data';
import { lngStatus, pipelineStatus, refineryStatus, terminalStatus } from './encoding';
import { formatCapacity, formatCountry, formatRefineryCapacity, formatIndexShare, formatNumber, formatShare, formatSignedPct } from './format';
import { STORAGE_HEADLINE, storageByCountry, storageFigure, type CountryStorage } from './gasStorage';
import { cellIndex } from './globe';
import { pointInPolygon } from './geo';
import { detailKind, statusLabel } from './labels';
import { selectionEnabled, VIEW_IDS, VIEW_LABELS, viewEnabled, type ViewId } from './views';

export interface ShareCard {
  /** What kind of page: "Chokepoint", "Oil origins". */
  kicker: string;
  title: string;
  /** One or two sentences, each a figure the page shows. */
  facts: string[];
  /** Where the facts come from, with a date; null when the card states none. */
  source: string | null;
  /** The globe's centre, [lon, lat]. */
  center: [number, number];
  /** Mask cells (`cellIndex` on the `GLOBE.maskCell` grid) the globe lights. */
  focus: number[];
}

/** The index files, one per selection kind plus one for the surfaces: `share/<file>.json`. */
export type ShareFile = SelectionKind | 'view';
export type ShareIndex = Record<string, ShareCard>;

const CROSS = ' · ';

// Keys -------------------------------------------------------------------------------------------------

/** Which file a link's card is in, or null for a link to Home. */
export function shareFile(selection: Selection | null, view: ViewId | null): ShareFile | null {
  return selection ? selection.kind : view ? 'view' : null;
}

/**
 * The keys to try for a link, most specific first. A country has a card per surface it can be read on;
 * a region has one per fuel.
 */
export function shareKeys(selection: Selection | null, view: ViewId | null, fuel: RegionFuel = DEFAULT_REGION_FUEL): string[] {
  if (!selection) return view ? [view] : [];
  const key = `${selection.kind}/${selection.id}`;
  if (selection.kind === 'country' && view) return [`${key}@${view}`, key];
  if (selection.kind === 'region' && fuel !== DEFAULT_REGION_FUEL) return [`${key}@${fuel}`, key];
  return [key];
}

// Where on the globe -----------------------------------------------------------------------------------

const cell = GLOBE.maskCell;

/** Cells within `radius` degrees of a point. */
export function pointCells([lon, lat]: [number, number], radius: number = SHARE.pointRadiusDeg): number[] {
  const cells = new Set<number>();
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  for (let dy = -radius; dy <= radius; dy += cell / 2) {
    for (let dx = -radius / cos; dx <= radius / cos; dx += cell / 2) {
      if ((dx * cos) ** 2 + dy ** 2 <= radius ** 2) cells.add(cellIndex(cell, lat + dy, lon + dx));
    }
  }
  return [...cells];
}

/** Cells a line passes through, sampled every half cell along each segment. */
export function lineCells(geometry: LineString | MultiLineString): number[] {
  const cells = new Set<number>();
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const [x0, y0] = line[i]!;
      const [x1, y1] = line[i + 1] ?? line[i]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1! - x0!, y1! - y0!) / (cell / 2)));
      for (let s = 0; s <= steps; s++) cells.add(cellIndex(cell, y0! + ((y1! - y0!) * s) / steps, x0! + ((x1! - x0!) * s) / steps));
    }
  }
  return [...cells];
}

/** Cells whose centre is inside a shape. */
export function polygonCells(geometry: Polygon | MultiPolygon): number[] {
  const cells = new Set<number>();
  const [[west, south], [east, north]] = extent(geometry);
  for (let lat = Math.floor(south / cell) * cell + cell / 2; lat < north; lat += cell) {
    for (let lon = Math.floor(west / cell) * cell + cell / 2; lon < east; lon += cell) {
      if (pointInPolygon([lon, lat], geometry)) cells.add(cellIndex(cell, lat, lon));
    }
  }
  return [...cells];
}

/**
 * A line or shape that lights fewer than `minCells` cells gets the ring around its centre too, so it shows.
 * Added when the card is drawn, not stored in the index.
 */
export function withRing(cells: number[], center: [number, number]): number[] {
  return cells.length < SHARE.minCells ? [...new Set([...cells, ...pointCells(center)])] : cells;
}

function extent(geometry: Geometry | { type: 'Ring'; coordinates: Position[] }): [[number, number], [number, number]] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (value: unknown): void => {
    if (Array.isArray(value) && typeof value[0] === 'number') {
      const [lon, lat] = value as [number, number];
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  visit((geometry as { coordinates: unknown }).coordinates);
  return [
    [west, south],
    [east, north],
  ];
}

const middle = ([[w, s], [e, n]]: [[number, number], [number, number]]): [number, number] => [(w + e) / 2, (s + n) / 2];

/** The middle of a shape's largest part, so the US centres on the lower 48 and not between them and Alaska. */
export function polygonCenter(geometry: Polygon | MultiPolygon): [number, number] {
  const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best: [[number, number], [number, number]] | null = null;
  let bestArea = -1;
  for (const part of parts) {
    const box = extent({ type: 'Ring', coordinates: part[0] ?? [] });
    const area = (box[1][0] - box[0][0]) * (box[1][1] - box[0][1]);
    if (area > bestArea) [best, bestArea] = [box, area];
  }
  return best ? middle(best) : [0, 0];
}

const round1 = ([lon, lat]: [number, number]): [number, number] => [Math.round(lon * 10) / 10, Math.round(lat * 10) / 10];

// What the card says -----------------------------------------------------------------------------------

/** "per gem.wiki, 2026-10-12", or the meter for measured flow. */
function statusSource(evidence: Evidence | undefined): string {
  if (!evidence) return 'No sourced status yet';
  if (evidence.sourceType === 'measured') return `Status from measured flow, ${evidence.observedAt}`;
  let host = '';
  try {
    host = evidence.url ? new URL(evidence.url).hostname.replace(/^www\./, '') : '';
  } catch {
    host = '';
  }
  return host ? `Status per ${host}, ${evidence.observedAt}` : `Status as of ${evidence.observedAt}`;
}

const listOf = (names: string[], max = 4) =>
  names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', ');

const sources = (rows: { kind: string; label: string; share: number }[]) =>
  rows
    .filter((r) => r.kind !== 'other' && r.kind !== 'unspecified')
    .slice(0, SHARE.topSources)
    .map((r) => `${r.label} ${formatShare(r.share)}`)
    .join(', ');

const IMPORT_SOURCE = { eurostat: 'Eurostat', comtrade: 'UN Comtrade', eia: 'EIA' } as const;

/** Every page's card, by file and key. */
export function shareCards(data: Datasets): Record<ShareFile, ShareIndex> {
  const out: Record<ShareFile, ShareIndex> = { pipeline: {}, chokepoint: {}, basin: {}, country: {}, lng: {}, terminal: {}, refinery: {}, region: {}, view: {} };

  for (const c of data.chokepoints) {
    const flow = chokepointFlow(seriesById(data, c.transitSeriesId));
    const facts: string[] = [];
    if (flow?.indexFiveYear != null) facts.push(`${formatIndexShare(flow.indexFiveYear)} of the five-year average for tanker transits, last 7 days`);
    if (flow?.recent) facts.push(`${formatNumber(flow.recent.mean, 1)} tanker transits a day, to ${flow.latestDate}`);
    out.chokepoint[`chokepoint/${c.id}`] = {
      kicker: 'Chokepoint',
      title: c.name,
      facts,
      source: flow ? 'IMF PortWatch, daily tanker transits' : null,
      center: round1(c.point),
      focus: pointCells(c.point),
    };
  }

  for (const p of data.pipelines) {
    const route = [p.fromCountry, ...p.transitCountries, p.toCountry].filter(Boolean).map(formatCountry).join(' → ');
    const status = statusLabel(pipelineStatus(p));
    const center = middle(extent(p.geometry));
    out.pipeline[`pipeline/${p.id}`] = {
      kicker: detailKind({ kind: 'pipeline', item: p }),
      title: p.name,
      facts: [route, p.capacity ? `${status}, ${formatCapacity(p.capacity)} capacity` : status].filter(Boolean),
      source: statusSource(p.evidence[0]),
      center: round1(center),
      focus: lineCells(p.geometry),
    };
  }

  for (const t of data.lngTerminals) {
    const status = statusLabel(lngStatus(t));
    const { operating } = t.capacityMtpa;
    out.lng[`lng/${t.id}`] = {
      kicker: detailKind({ kind: 'lng', item: t }),
      title: t.name,
      facts: [t.country ? formatCountry(t.country) : '', operating > 0 ? `${status}, ${formatNumber(operating, 1)} Mtpa operating` : status].filter(Boolean),
      source: statusSource(t.evidence[0]),
      center: round1(t.point),
      focus: pointCells(t.point),
    };
  }

  for (const t of data.oilTerminals) {
    const status = statusLabel(terminalStatus(t));
    out.terminal[`terminal/${t.id}`] = {
      kicker: detailKind({ kind: 'terminal', item: t }),
      title: t.name,
      facts: [
        formatCountry(t.country),
        t.throughput ? `${status}, about ${formatNumber(t.throughput.value, 1)} mb/d loaded (${t.throughput.period}, ${t.throughput.source.publisher})` : status,
      ],
      source: statusSource(t.evidence[0]),
      center: round1(t.point),
      focus: pointCells(t.point),
    };
  }

  // Empty while the refineries surface is off (assembleDatasets).
  for (const r of data.refineries) {
    const status = statusLabel(refineryStatus(r));
    out.refinery[`refinery/${r.id}`] = {
      kicker: detailKind({ kind: 'refinery', item: r }),
      title: r.name,
      facts: [
        [r.state, formatCountry(r.country)].filter(Boolean).join(', '),
        r.capacity
          ? `${status}, ${formatRefineryCapacity(r.capacity)} of ${r.pointSource === 'wikidata' ? 'crude' : 'crude distillation'} capacity (${r.capacity.source.publisher}, ${r.capacity.asOf})`
          : status,
      ],
      source: statusSource(r.evidence[0]),
      center: round1(r.point),
      focus: pointCells(r.point),
    };
  }

  for (const b of data.basins) {
    const where = b.countries.length ? listOf(b.countries.map(formatCountry)) : 'Offshore';
    out.basin[`basin/${b.id}`] = {
      kicker: detailKind({ kind: 'basin', item: b }),
      title: b.name,
      facts: [where, b.dominant ? `Mostly ${b.dominant}` : ''].filter(Boolean),
      source: 'USGS World Petroleum Assessment 2000',
      center: round1(b.labelPoint),
      focus: polygonCells(b.geometry),
    };
  }

  // Countries: a card for the oil origins surface, one for gas storage, and one for a link with neither.
  const storage = viewEnabled('storage') ? storageByCountry(data.series) : new Map<string, CountryStorage>();
  for (const c of data.countries) {
    const center = polygonCenter(c.geometry);
    const base = { title: formatCountry(c.id) === c.id ? c.name : formatCountry(c.id), center: round1(center), focus: polygonCells(c.geometry) };
    const record = viewEnabled('origins') ? data.crudeImports.find((r) => r.id === c.id) : undefined;
    const imports: ShareCard | null = record
      ? {
          ...base,
          kicker: 'Oil origins',
          facts: [`Largest crude sources: ${sources(countryOrigins(record).rows)}`],
          source: `${IMPORT_SOURCE[record.source]}, ${importPeriod(record)}${record.basis === 'value' ? ', by value' : ''}`,
        }
      : null;
    const s = storage.get(c.id);
    const gas: ShareCard | null = s
      ? {
          ...base,
          kicker: 'Gas storage',
          facts: [
            `${storageFigure(s)} ${STORAGE_HEADLINE[s.source]} ${s.summary.latest.date}`,
            ...(s.vsLastYearPct !== null ? [`${formatSignedPct(s.vsLastYearPct)} against a year earlier`] : []),
          ],
          source: STORAGE_SOURCES[s.source].name,
        }
      : null;
    const key = `country/${c.id.toLowerCase()}`;
    if (imports) out.country[`${key}@origins`] = imports;
    if (gas) out.country[`${key}@storage`] = gas;
    out.country[key] = gas ?? imports ?? { ...base, kicker: 'Country', facts: [], source: null };
  }

  // US fuel regions: one card per fuel.
  if (selectionEnabled('region')) {
    for (const r of data.oilOrigins) {
      const shape = data.usRegions.find((u) => u.id === r.id);
      const center: [number, number] = shape?.labelPoint ?? [-98, 39];
      for (const fuel of REGION_FUELS) {
        const origins = fuel === 'crude' ? originsFor(data, r) : fuelOriginsFor(data, r.id, fuel);
        if (!origins) continue;
        const card: ShareCard = {
          kicker: 'US fuel region',
          title: r.name,
          facts: [`${REGION_FUEL_LABELS[fuel]}, largest sources: ${sources(origins.rows)}`],
          source: `EIA, ${origins.from} to ${origins.to}`,
          center: round1(center),
          focus: shape ? polygonCells(shape.geometry) : pointCells(center),
        };
        out.region[fuel === DEFAULT_REGION_FUEL ? `region/${r.id}` : `region/${r.id}@${fuel}`] = card;
      }
    }
  }

  // Surfaces.
  const counts: Record<ViewId, () => { facts: string[]; focus: number[] }> = {
    chokepoints: () => ({
      facts: [`${data.chokepoints.length} chokepoints, with daily tanker transits`],
      focus: data.chokepoints.flatMap((c) => pointCells(c.point)),
    }),
    pipelines: () => ({
      facts: [`${data.pipelines.length.toLocaleString('en-US')} oil, gas and products pipelines, with their status and owners`],
      focus: data.pipelines.flatMap((p) => lineCells(p.geometry)),
    }),
    terminals: () => ({
      facts: [`${data.lngTerminals.length.toLocaleString('en-US')} LNG terminals and ${data.oilTerminals.length} oil terminals`],
      focus: [...data.lngTerminals, ...data.oilTerminals].flatMap((t) => pointCells(t.point, 1)),
    }),
    refineries: () => ({
      facts: [`${data.refineries.length} refineries in the US and Europe, with their status and, in the US, crude distillation capacity`],
      focus: data.refineries.flatMap((r) => pointCells(r.point, 1)),
    }),
    basins: () => ({
      facts: [`${data.basins.length} petroleum provinces, as USGS assessed them`],
      focus: data.basins.flatMap((b) => pointCells(b.labelPoint, 1)),
    }),
    storage: () => ({
      facts: [`Gas in storage for ${storage.size} countries`],
      focus: data.countries.filter((c) => storage.has(c.id)).flatMap((c) => polygonCells(c.geometry)),
    }),
    origins: () => ({
      facts: [`Where crude oil imports come from, for ${data.crudeImports.length} countries`],
      focus: data.countries.filter((c) => data.crudeImports.some((r) => r.id === c.id)).flatMap((c) => polygonCells(c.geometry)),
    }),
  };
  for (const view of VIEW_IDS) {
    if (!viewEnabled(view)) continue;
    const { facts, focus } = counts[view]();
    out.view[view] = {
      kicker: 'Map',
      title: VIEW_LABELS[view],
      facts,
      source: null,
      center: SHARE.viewCenters[view] ?? [20, 30],
      focus: [...new Set(focus)].slice(0, SHARE.maxViewCells),
    };
  }
  return out;
}

// The page's tags --------------------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The card's facts and source as one line, for the description tags; the kind of page alone when it has none. */
export function shareDescription(card: Pick<ShareCard, 'kicker' | 'facts' | 'source'>): string {
  return [...(card.facts.length ? card.facts : [card.kicker]), card.source].filter(Boolean).join('. ') + '.';
}

const START = '<!-- share:start -->';
const END = '<!-- share:end -->';

/**
 * Replaces the share tags in index.html (between the share markers) with a card's: title, description,
 * Open Graph and Twitter. `url` is the page, `image` the card's picture; both absolute.
 */
export function withShareTags(html: string, card: Pick<ShareCard, 'kicker' | 'title' | 'facts' | 'source'>, { url, image }: { url: string; image: string }): string {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) return html;
  const title = `${card.title}${CROSS}${card.kicker}`;
  const description = shareDescription(card);
  const tags = [
    `<title>${escapeHtml(`${card.title}${CROSS}Petro Sprawl`)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Petro Sprawl" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeHtml(`${title}, on a globe drawn in dots`)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join('\n    ');
  return `${html.slice(0, start + START.length)}\n    ${tags}\n    ${html.slice(end)}`;
}
