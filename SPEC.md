# Energy Terminal: Prototype Spec v0.1

Owner: Roby Saavedra · Date: 2026-10-28 · Status: ready to build
Product brief: [`docs/product-brief.md`](docs/product-brief.md) (living version: https://claude.ai/artifact/ST7c3oPER2WRix9pCS2Qkn)
Research: [`docs/research/`](docs/research/)

## 1. What we're building

A personal, desktop-first, map-first terminal for understanding world events through the movement of energy. The thesis: energy flows explain a lot about why international decisions get made, alliances form, and ruptures happen.

This first prototype proves two things:

1. **The default screen works:** a full-bleed map with one summary panel, where anything on the map can be selected to see its details and evidence.
2. **The core idea works:** showing the gap between what energy infrastructure *could* carry (capacity) and what it *actually* carries (flow), with the *status* of each asset backed by dated, sourced evidence.

Scope is one theater: the oil and gas corridor connecting **Europe, Russia, the Caspian, North Africa and the Middle East**, plus the world's seven major oil chokepoints.

## 2. Principles (apply to every decision)

- **Map first.** Every item lands on the map before it becomes text. The map is an antidote to abstraction: events are real happenings in real places.
- **Capacity, status and flow are three separate things.** Never collapse them into one badge.
- **Show evidence, not opinions.** Status is a dated, sourced claim. The interface shows the claim, its source and its date. Interpretation stays with the user.
- **Claims age symmetrically.** Positive and negative claims lose authority at the same rate. An "operating" claim from April is exactly as stale as an "offline" claim from April.
- **Data age is always visible.** Every number shows when it was fetched.
- **Never invent data.** If a value isn't sourced, it is `unknown`. Unknown is an honest, acceptable state.
- **Me first.** One user, no accounts, no onboarding. Keep personal lists (companies) as swappable data files so the tool can open up later.

## 3. Scope

**In v0.1**

- Default screen: map plus summary panel, with drill-down to detail views
- Layers: basin outlines, pipelines, chokepoints, EU gas storage, country borders and labels
- Scheduled data jobs that fetch, normalize and store data as static JSON, with freshness metadata
- Evidence model for pipeline status, with a curated set of corridor pipelines researched and cited
- Flow-versus-capacity for (a) chokepoints via tanker transit counts and (b) EU gas entry points via ENTSOG physical flows
- Light and dark themes via design tokens, following the system setting

**Out of v0.1 (later)**

- News event layer and story placement
- Company layer (the follow list is included as data but not displayed)
- Interpretation or "nudging" features
- Mobile layout
- Historical time-scrubbing (keep only the history needed for baselines)
- Accounts, sharing, alerts

## 4. Default screen

### Layout (desktop, 1280px and wider)

```
+--------------------+---------------------------------------------+
| Panel (400px)      |                                             |
|                    |                 Map (full bleed)            |
| [Search          ] |                                             |
|                    |                                             |
| Summary / Detail   |                                             |
|                    |                                     [Layers]|
|                    |                                             |
| Updated 3h ago     |                          scale · attribution|
+--------------------+---------------------------------------------+
```

- Map fills the viewport; the panel sits on the left, flush, full height. Every visit opens on the summary (the home view). The search is one floating bar at the top left, over the top of the panel when it is open, and over the map when the panel is minimized (with a button to reopen it), so it never moves; selecting anything reopens it on that detail (decided 2026-10-28, after Google Maps).
- A compact layer control floats on the map (top right). Layers can be toggled; defaults are all on.
- Initial camera frames the theater (roughly lon -15 to 65, lat 10 to 72).

### Panel states

1. **Summary (default on open)**
   - Headline counts for the theater: pipelines by status, chokepoints with flow notably above or below baseline, EU storage fill versus the same date last year.
   - "What changed since last visit" list: status changes, flow swings, storage moves. Each row links to the asset on the map. Last visit timestamp lives in `localStorage` (wrapped in try/catch; render fine without it).
   - Data freshness for each dataset, and every dataset's source and license as its job recorded them.
   - As built (M5): storage is counted by country ("16 of 20 countries below the same date last year") rather than as one EU fill, because a fair EU figure needs each country's working gas volume. Loads less than 30 minutes apart count as one visit, so a reload doesn't swallow the changes. Flow swings are listed at 15 points of capacity or more, storage moves at 2 points or more (`CHANGES` in `src/lib/config.ts`). A load where a dataset failed isn't saved as the next visit's baseline.
2. **Pipeline detail:** name, commodity, route (from → transit → to), operator and owners, capacity, current status with its evidence (source type, statement, link, date), measured flow where available (sparkline, last 90 days, flow as share of capacity), disruption history.
3. **Chokepoint detail:** EIA reference volume (mb/d, 2024), daily tanker transits with the 7-day average against two baselines: the trailing 365-day average and the five-year average before that year. Flow index for each, 90-day sparkline with both baselines drawn, and sourced disruptions. The map colors by the five-year index, because a trailing year absorbs a long disruption within twelve months (decided 2026-10-28, after Hormuz transits fell from about 43 a day to about 1 in March 2026).
4. **Basin detail:** name, countries it spans, pipelines and chokepoints inside or touching it.
5. **Storage detail (country):** fill level, trend, same date last year.

### Interactions

- **Hover:** highlight the feature and show a minimal tooltip (name plus one key figure).
- **Click:** select it, fly the camera to fit, open its detail in the panel.
- **Back / Esc:** return to the previous panel state. Selection and camera are in the URL (shareable, reloadable).
- **Search:** type-ahead across pipelines, chokepoints, basins and countries.
- **Quick filters:** a row of chips over the map: offline or idle, below baseline, unverified claims, metered flow, gas, oil, each with its match count. One at a time; matches stay at full strength on the map, the rest fade, and the panel lists the matches in place of the summary. The filter is in the URL (`f=`), and Back or Esc clears it (decided 2026-10-28, after Google Maps' category chips).
- **Keyboard:** `/` focuses search, `Esc` goes back, `L` toggles the layer control, `[` minimizes or reopens the panel.

## 5. Map layers

| Layer | Geometry | Encoding | Source |
| --- | --- | --- | --- |
| Basins | Polygons | Very quiet outline, faint fill on hover; label at higher zoom | USGS World Petroleum Assessment provinces (simplified) |
| Pipelines | Lines | Width by capacity; style by status (solid = operating, dashed = reduced, dotted or faded = offline/idle, hairline = planned); measured flow shown as a brighter inner line sized to flow share | GEM inventory + curated evidence + ENTSOG flows |
| Chokepoints | Points | Ring sized by EIA reference volume; ring segment or color by flow index (below, near, above baseline) | EIA baselines + IMF PortWatch |
| EU gas storage | Country fills | Fill level as a sequential scale, only when the layer is on (off by default, on when a link selects a country) | GIE AGSI+; outlines from Natural Earth 1:50m |
| Countries | Borders, labels | Minimal | Basemap |
| Day/night (nice to have) | Terminator | Subtle shade | Computed client-side |

Rules:

- Use real pipeline route geometry where the source provides it. Where only endpoints exist, draw a great-circle line and mark the feature `geometryApprox: true`; render it visibly differently (for example, thinner and lighter). Routes the source itself flags as low accuracy (GEM `RouteAccuracy: low`) are also `geometryApprox` (decided 2026-10-28).
- Flow index bands: below baseline (index < 0.85), near (0.85 to 1.15), above (> 1.15). Keep thresholds in one config file.
- Color is reserved for meaning (status, flow, data age). The basemap is neutral and quiet.
- Flow and status use separate hue families, so a chokepoint below baseline never reads as an offline pipeline. Operating pipelines are drawn faded so chokepoints and status problems stand out; chokepoints sit on a halo above the pipelines.

## 6. Data model

Everything is static JSON produced by the data jobs. TypeScript types live in `src/types` and are shared by jobs and app.

```ts
type Commodity = 'gas' | 'oil' | 'products' | 'ngl';

type AssetStatus =
  | 'operating' | 'reduced' | 'offline' | 'idle'
  | 'planned' | 'under_construction' | 'cancelled' | 'unknown';

interface Evidence {
  status: AssetStatus;
  sourceType: 'operator' | 'regulator' | 'government' | 'press' | 'dataset' | 'measured';
  statement?: string;        // short quote or paraphrase
  url?: string;
  observedAt: string;        // ISO date the claim refers to
  recordedAt: string;        // ISO date we recorded it
}

interface Pipeline {
  id: string;                // stable slug
  name: string;
  aliases: string[];         // used for dedup and search
  commodity: Commodity;
  fromCountry: string;       // ISO 3166-1 alpha-2
  toCountry: string;
  transitCountries: string[];
  operator?: string;
  owners?: { name: string; sharePct?: number }[];
  capacity?: { value: number; unit: 'bcm/yr' | 'mb/d' };
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  geometryApprox: boolean;
  evidence: Evidence[];      // newest first; current status = evidence[0]
  flowSeriesId?: string;     // links to an Observation series (e.g. ENTSOG)
  sources: string[];         // dataset ids this record came from
}

interface Chokepoint {
  id: string;                // 'hormuz' | 'malacca' | 'suez' | 'babelm' | 'danish' | 'turkish' | 'panama'
  name: string;
  point: [number, number];   // [lon, lat]
  eiaReferenceMbd: number;   // EIA 2024
  transitSeriesId: string;
}

interface ObservationSeries {
  id: string;
  metric: 'tanker_transits' | 'gas_flow_kwh_d' | 'storage_fill_pct';
  unit: string;
  points: { date: string; value: number }[];  // daily, trimmed to ~400 days
  capacity?: number;         // technical capacity in the same unit, if known
  fiveYear?: { mean: number; from: string; to: string; count: number };  // computed by the job from full history
}

interface SourceRef {
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;       // ISO date
}

interface Disruption {
  id: string;
  assetKind: 'pipeline' | 'chokepoint';
  assetId: string;
  startedAt: string;         // ISO date, or month when sources give no day
  endedAt?: string;
  cause: 'sabotage' | 'sanction' | 'maintenance' | 'commercial' | 'conflict' | 'accident' | 'other';
  summary: string;           // our words; contested claims attributed to who made them
  sources: SourceRef[];      // at least one
  recordedAt: string;
}

interface DatasetMeta {
  id: string;
  fetchedAt: string;         // last successful run
  recordCount: number;
  sourceUrl: string;
  sourceVersion?: string;    // release date or file hash for manual imports
  license: string;
  dataThrough?: string;      // latest observation date, for time series
  lastAttempt?: { at: string; ok: boolean; error?: string };
}
```

**Status display rule (symmetric aging):** current status is `evidence[0]`. If its `observedAt` is older than `STALE_AFTER_DAYS` (default 30, in config), show the status with an "unverified since <date>" marker, the same way for every status value. Never silently swap the status for a different value.

**Measured beats claimed:** where an observation series exists (ENTSOG flow), derive a `measured` evidence entry from the latest data and show it first, alongside the most recent sourced claim. The 7-day mean decides it: no flow (at most 0.5% of firm technical capacity) is `idle`, since a meter shows gas isn't moving but not why; anything else is `operating`. The app derives this when it loads data, so a new day of flows needs no rebuild.

**Cited claims beat dataset claims:** below measured flow, dated claims with a source (operator, regulator, government, press) rank above dataset claims (GEM), newest first within each. A dataset's date is when it last touched the row, not when anyone observed the pipeline (decided 2026-10-28, when GEM's 2023 "mothballed" row outranked the cited offline status of Nord Stream 1).

## 7. Data sources and jobs

### Sources

| Dataset | Gives | Access | Cadence | License / terms |
| --- | --- | --- | --- | --- |
| [Global Energy Monitor](https://globalenergymonitor.org/) Oil and Gas Infrastructure trackers | Pipeline inventory, routes, capacity, owners | Free download after registration; manual import | Quarterly, by hand | CC-BY 4.0, attribution required |
| Curated evidence file (`data/curated/pipelines-evidence.json`) | Status claims for corridor pipelines | Hand-researched, every claim cited | As events happen | Ours |
| [ENTSOG Transparency Platform](https://transparency.entsog.eu/) | Physical gas flows and technical capacity at EU entry points | Public REST API, no key ([docs](https://transparency.entsog.eu/pdf/TP_REG715_Documentation_TP_API_v1.3.pdf)) | Daily | Check terms; attribute |
| [GIE AGSI+](https://agsi.gie.eu/) | EU gas storage fill by country | REST API, free key via account ([docs](https://www.gie.eu/transparency-platform/GIE_API_documentation_v013.pdf)) | Daily | Check terms; attribute |
| [IMF PortWatch](https://portwatch.imf.org/) | Daily vessel transits at chokepoints, by vessel type | ArcGIS FeatureServer, no key: `services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query` (use `n_tanker`) | Daily (job runs every 6h) | Check terms; attribute |
| EIA World Oil Transit Chokepoints | Reference oil volumes per chokepoint (2024) | Static values, committed in code | Static | Public domain |
| [USGS World Petroleum Assessment provinces](https://sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3) | Basin outlines | Shapefile (14 MB); simplify once with mapshaper, commit result | Static | Public domain |
| Basemap: [OpenFreeMap](https://openfreemap.org/) or [Protomaps](https://protomaps.com/) | Vector tiles | No key | Static | OSM attribution |

EIA reference values (mb/d, 2024, the latest full year in EIA's table, read 2026-10-28): Hormuz 20.7, Malacca 22.5, Suez Canal and SUMED 4.8, Bab el-Mandeb 4.1, Danish Straits 4.9, Turkish Straits 3.6, Panama Canal 2.0 (fiscal year). Suez and Bab el-Mandeb are depressed in 2024 by Red Sea rerouting. Values live in `src/lib/config.ts`.

Note on units: PortWatch counts vessels, EIA measures barrels. Do not compare them directly. The chokepoint flow index compares tanker transits with their own trailing baseline; the EIA figure is shown as context for scale.

### Pipelines to curate for the corridor (v0.1)

Research and cite current status for each. Use `unknown` when a reliable, dated source can't be found.

- **Russia to Europe and Turkey (gas):** Nord Stream 1, Nord Stream 2, Yamal–Europe, Brotherhood/Soyuz (Ukraine transit), Urengoy–Pomary–Uzhhorod (Progress), TurkStream, Blue Stream
- **Southern Gas Corridor:** South Caucasus Pipeline, TANAP, TAP
- **North Africa to Europe (gas):** Transmed, Greenstream, Medgaz, Maghreb–Europe
- **Norway to Europe (gas):** Langeled, Europipe I and II, Franpipe, Zeepipe; Baltic Pipe
- **Eastern Mediterranean (gas):** Arab Gas Pipeline, Arish–Ashkelon
- **Oil:** Druzhba (north and south branches), CPC, BTC, Kirkuk–Ceyhan, East–West (Petroline), Habshan–Fujairah, SUMED, Baltic Pipeline System 1 and 2

Dedup GEM rows against curated rows by name similarity plus endpoint proximity; when they match, the curated record wins and the GEM row's name goes into `aliases`. Log every merge in a report file so it can be reviewed.

As built (M4): each curated record lists its GEM rows by id, checked by hand, and may set `exclude` or turn off automatic matching for systems whose segments share a name (Druzhba). Automatic matches need name similarity of at least 0.6 (Dice on name words, numbers must agree, so "Nord Stream" never matches "Nord Stream 2") and every country of the GEM row on the curated route, which stands in for endpoint proximity. Matches that fail only the country check are logged as near misses. The report is `data/reports/dedup.json`. Merged rows become one record: combined geometry, curated name, route and evidence, GEM operator and owners, and GEM capacity unless the curated record cites its own (TurkStream's two strings).

### ENTSOG entry points to map first

Identify the right point IDs in ENTSOG and link each to its pipeline. Starting candidates: Greifswald (Nord Stream), Mallnow (Yamal–Europe), Velké Kapušany (Ukraine transit into Slovakia), Strandzha 2 (TurkStream into Bulgaria), Kipi (TANAP/TAP into Greece), Mazara del Vallo (Transmed), Gela (Greenstream), Almería (Medgaz). Verify each against the platform before relying on it.

### Job architecture: fetch, store, read

- Jobs are Node 22 TypeScript scripts in `jobs/`, run by **GitHub Actions on a schedule** (every 6 hours; ENTSOG, AGSI+ and PortWatch daily is enough, but 6h keeps data fresh after delays).
- Each job: fetch, validate (schema check with zod), transform, write JSON to `public/data/<dataset>.json`, write `public/data/meta/<dataset>.json` (`DatasetMeta`), commit if changed. The site redeploys on commit.
- A failed fetch keeps the last good file and records the failure in meta. Never publish an empty or invalid file over a good one.
- Manual imports (GEM, USGS basins) are separate scripts that record source release date and SHA-256 in `DatasetMeta.sourceVersion`.
- The browser only ever reads `public/data/*`. No live calls to upstream sources from the client.
- API keys (AGSI+) live in GitHub Actions secrets.

## 8. Tech stack

- **App:** Vite, React, TypeScript (strict)
- **Map:** MapLibre GL JS for the basemap, deck.gl layers via `@deck.gl/mapbox` overlay (lines, paths, scatter, polygons)
- **State:** URL as the source of truth for selection and camera; small React state otherwise (no state library unless needed)
- **Charts:** small hand-rolled SVG sparklines (no chart library for v0.1)
- **Data jobs:** Node 22 + TypeScript (`tsx`), zod for validation, mapshaper for one-off geometry simplification
- **Hosting:** static site on Cloudflare Pages, Vercel or Netlify (free tier); jobs on GitHub Actions
- **Testing:** Vitest for transforms, flow index math, status aging and dedup; one Playwright smoke test that loads the app and selects a pipeline
- **No database, no server** in v0.1

Ask before adding dependencies beyond this list.

## 9. Visual design

Minimal Swiss and Japanese design meets the Bloomberg terminal. Legibility and scannability first.

- **Type:** IBM Plex Sans for interface text, IBM Plex Mono for numbers, units, coordinates, timestamps and IDs (Google Fonts). Use tabular figures. Alternative pairing to try later: Inter with JetBrains Mono.
- **Case:** sentence case everywhere. No uppercase eyebrow labels, no letter-spaced small caps.
- **Hierarchy:** size and weight, not decoration. Generous spacing in the panel; dense tables where density helps scanning.
- **Color:** a neutral, quiet base. Semantic tokens only: `status-operating`, `status-reduced`, `status-offline`, `status-unknown`, `flow-below`, `flow-near`, `flow-above`, `data-stale`. Never rely on color alone: pair with line style, shape or a label.
- **Themes:** all colors as CSS custom properties on `:root`, with dark values under `prefers-color-scheme: dark`; a manual toggle overrides. Basemap style switches with the theme.
- **Numbers:** units always shown (`55 bcm/yr`, `1.20 mb/d`, `82% full`). Dates as `2026-10-28`; data age as `Updated 3 h ago · 14:02 UTC`.
- **Motion:** minimal. Camera fly-to on selection; no decorative animation.

## 10. Repo structure

```
energy-terminal/
  SPEC.md                      this file
  CLAUDE.md                    working notes for Claude Code
  README.md
  docs/
    product-brief.md           why, for whom, decisions
    research/                  landscape and World Monitor teardown
  src/
    app/                       React shell, routing, URL state
    map/                       MapLibre + deck.gl layers
    panel/                     Summary and detail views
    lib/                       status aging, flow index, formatting
    types/                     shared types (also used by jobs)
    styles/                    tokens, themes, typography
  jobs/
    fetch-portwatch.ts
    fetch-entsog.ts
    fetch-agsi.ts
    build-pipelines.ts         merges GEM + curated evidence + flow links
    import-gem.ts              manual
    import-basins.ts           manual
  data/
    raw/                       manual source files (gitignored if large)
    curated/
      pipelines-evidence.json
      disruptions.json
      entsog-points.json       ENTSOG point id → pipeline id
    companies/
      follows-sorted.csv       Reuters follow list, grouped (not used in v0.1)
      reuters-follows-raw.tsv  original paste
  public/data/                 job outputs read by the app
    meta/
  scripts/
    classify_follows.py        regenerates follows-sorted.csv
  tests/
  .github/workflows/data.yml
```

## 11. Milestones and acceptance criteria

**M0: Scaffold.** Vite + React + TS app, MapLibre basemap in both themes, panel shell, tokens, fonts, URL state; update CLAUDE.md with commands.
Done when: the app runs locally, shows the theater, the panel collapses, and the theme follows the system setting.

**M1: Static layers.** Simplified basins, GEM pipelines filtered to the theater, chokepoint points with EIA values. Hover and click work; detail views show static fields.
Done when: every pipeline and chokepoint in the theater is selectable, the URL reflects the selection, and approximate geometry renders differently.

**M2: Data jobs and freshness.** GitHub Actions workflow, PortWatch job, DatasetMeta for every dataset, last-good-file protection, freshness in the panel.
Done when: a scheduled run updates `public/data`, a forced failure leaves the previous file intact, and data age shows correctly.

**M3: Chokepoint flow.** 7-day average of `n_tanker` versus the trailing 365-day average and the five-year average before it, flow index bands, sparklines, ring encoding (ring color by five-year band; inner disk area proportional to the index).
Done when: each of the seven chokepoints shows its index and a 90-day sparkline, with unit tests covering the math.

**M4: Evidence and gas flows.** Curated evidence for the corridor list with citations, symmetric aging, dedup report, ENTSOG flows linked to pipelines (flow as share of capacity), AGSI+ storage layer.
Done when: Nord Stream shows offline with its cited evidence and date; Ukraine transit lines reflect the January 2025 end of transit with a source; at least five pipelines show measured ENTSOG flow; storage fills render by country.

**M5: Summary and polish.** Summary state with counts and "what changed since last visit", search, keyboard shortcuts, empty and error states, attribution footer.
Done when: opening the app gives a useful summary in under two seconds on a warm cache, every summary row links to its asset, and all source attributions appear.

## 12. Working notes for Claude Code

- Read this spec fully before starting. Build milestone by milestone and stop for review at the end of each.
- Never fabricate statuses, capacities, flows or URLs. If something can't be sourced, use `unknown` and list it in a `TODO-research.md`.
- Keep transforms pure and tested; keep thresholds and constants in `src/lib/config.ts`.
- Prefer small, readable modules over abstraction. This is a personal tool.
- Inspiration, not a template: [World Monitor](https://github.com/koala73/worldmonitor) (AGPL-3.0) is a useful reference for data patterns. Do not copy its code or curated data files; go to the original sources.

## 13. Open questions

- Which basemap provider (OpenFreeMap or Protomaps) gives the cleanest minimal style?
- Dark and light are both built; which should be the default when the system has no preference?
- `STALE_AFTER_DAYS`: is 30 the right default for curated evidence?
- Later: news sources and story placement (asset, then company, then place, then country), and matching companies to assets via GEM's ownership tracker.
