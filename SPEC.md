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

Basins and GEM pipelines are imported worldwide (`IMPORT_BOUNDS` in `src/lib/config.ts`, decided 2026-10-28) so the map holds context everywhere. The theater is still where the camera opens and where the research goes: curated corridor pipelines, measured flows (ENTSOG), storage (AGSI+) and LNG send-out (ALSI) cover it only, so pipelines elsewhere carry GEM's dataset status alone.

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
| [≡ Search        ] | (filter chips)                              |
| Panel (400px)      |                 Map (full bleed)            |
|                    |                                             |
|                    |                                             |
| Summary / Detail   |                                             |
|                    |                                             |
|                    |                                             |
| Updated 3h ago     | [Layers]                 scale · attribution|
+--------------------+---------------------------------------------+
```

- Map fills the viewport; the panel sits on the left, flush, full height. Every visit opens on the summary (the home view). The search is one floating bar at the top left, over the top of the panel when it is open, and over the map when the panel is minimized (with a button to reopen it), so it never moves; selecting anything reopens it on that detail (decided 2026-10-28, after Google Maps).
- A compact Layers button sits at the map's bottom left; the layer list opens above it and closes on `L`, Esc or a click elsewhere. Layers default to on, except EU gas storage (see section 5). The top edge is left to the filter chips (decided 2026-10-28, after Google Maps).
- Initial camera frames the theater (roughly lon -15 to 65, lat 10 to 72).

### Panel states

1. **Summary (default on open)**
   - A dashboard of four tiles leads the panel, one number each with a small picture: chokepoints below baseline (a ring per chokepoint, the worst named), pipelines offline or idle (a status bar), EU storage countries below last year (a tick per country around zero, with the median gap), and changes since last visit. Each tile opens what it counts: its filter, the storage layer, or the changes list (decided 2026-10-28).
   - "What changed since last visit" list: status changes, flow swings, storage moves. Each row links to the asset on the map. Last visit timestamp lives in `localStorage` (wrapped in try/catch; render fine without it).
   - Data age in the panel footer ("Updated 3 h ago"), which opens the app menu at the full freshness table.
   - As built (M5): storage is counted by country ("16 of 20 countries below the same date last year") rather than as one EU fill, because a fair EU figure needs each country's working gas volume. Loads less than 30 minutes apart count as one visit, so a reload doesn't swallow the changes. Flow swings are listed at 15 points of capacity or more, storage moves at 2 points or more (`CHANGES` in `src/lib/config.ts`). A load where a dataset failed isn't saved as the next visit's baseline.
2. **Pipeline detail:** name, commodity, route (from → transit → to), operator and owners, capacity, age (year in service) and history, length and diameter, current status with its evidence (source type, statement, link, date), measured flow where available (sparkline, last 90 days, flow as share of capacity), disruption history.
3. **Chokepoint detail:** EIA reference volume (mb/d, 2024), daily tanker transits with the 7-day average against two baselines: the trailing 365-day average and the five-year average before that year. Flow index for each, 90-day sparkline with both baselines drawn, and sourced disruptions. The map colors by the five-year index, because a trailing year absorbs a long disruption within twelve months (decided 2026-10-28, after Hormuz transits fell from about 43 a day to about 1 in March 2026).
4. **Basin detail:** name, countries it spans, pipelines and chokepoints inside or touching it.
5. **Storage detail (country):** fill level, trend, same date last year.
6. **Detail layout, all kinds** (decided 2026-10-28): a header with the kind icon, the kind and the name; then what the asset is about, largest (a pipeline's status and its evidence, a chokepoint's or a country's headline figure); then a strip of two or three key numbers; then charts, disruptions and history; then secondary facts under "Details"; sources last. Related assets (a basin's pipelines and chokepoints) are rows with icon and status, counted in the heading, corridor pipelines first, the first six showing and the rest behind "Show all" (`DETAIL.relatedLimit` in `src/lib/config.ts`).

### Interactions

- **Hover:** highlight the feature and show a minimal tooltip (name plus one key figure).
- **Click:** select it, fly the camera to fit, open its detail in the panel.
- **Close / Esc:** the search bar shows the name of whatever is open (an asset, or the active filter). Its × clears typing, or otherwise closes what is open and returns to the previous panel state; Esc does the same. There is no separate Back button (decided 2026-10-28, after Google Maps). Selection and camera are in the URL (shareable, reloadable).
- **Search:** type-ahead across pipelines, chokepoints, basins and countries.
- **App menu:** a menu button at the left of the search bar opens a drawer over everything with app-level settings and information: theme, data freshness for each dataset, every dataset's source and license as its job recorded them, keyboard shortcuts, and a short about. Esc or the backdrop closes it (decided 2026-10-28, after Google Maps' main menu).
- **Quick filters:** a row of chips over the map: offline or idle, below baseline, unverified claims, metered flow, gas, oil, each with its match count. One at a time; matches stay at full strength on the map, the rest fade, and the panel lists the matches in place of the summary. The filter is in the URL (`f=`), and Back or Esc clears it (decided 2026-10-28, after Google Maps' category chips).
- **Keyboard:** `/` focuses search, `Esc` goes back, `L` toggles the layer control, `[` minimizes or reopens the panel.

## 5. Map layers

| Layer | Geometry | Encoding | Source |
| --- | --- | --- | --- |
| Basins | Polygons | Very quiet outline, faint fill on hover; label at higher zoom | USGS World Petroleum Assessment provinces (simplified) |
| Pipelines | Lines | Width by capacity; style by status (solid = operating, dashed = reduced, dotted or faded = offline/idle, hairline = planned); measured flow shown as a brighter inner line sized to flow share | GEM inventory + curated evidence + ENTSOG flows |
| Chokepoints | Points | Ring sized by EIA reference volume; ring segment or color by flow index (below, near, above baseline) | EIA baselines + IMF PortWatch |
| LNG terminals | Points | Dot area by capacity in operation (planned capacity when nothing runs yet); color by status, as pipelines; import terminals have a hollow centre (added 2026-10-28) | GEM LNG terminals tracker |
| Oil terminals | Points | Diamond of one size, colored by the latest cited claim's status; unknown when nothing could be sourced (added 2026-10-29) | Curated `data/curated/oil-terminals.json`; locations from IMF PortWatch's ports database or the end of a GEM pipeline |
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
  system?: string;           // the system this is one section of (GEM's project name); sections list each other
  commodity: Commodity;
  fromCountry: string;       // ISO 3166-1 alpha-2
  toCountry: string;
  transitCountries: string[];
  operator?: string;
  owners?: { name: string; sharePct?: number }[];
  ownersSource?: PageRef;    // when a curated record cites the owners (replaces GEM's, drops parents)
  parents?: { name: string; sharePct?: number }[];  // GEM's ultimate parents, kept only when they differ from the owners
  capacity?: { value: number; unit: 'bcm/yr' | 'mb/d' };
  history?: {                // GEM: start years per section (targets when expected), proposal, construction, stop
    startYears: number[]; expected: boolean;
    proposalYear?: number; constructionYear?: number; stopYear?: number;
  };
  lengthKm?: { value: number; estimated: boolean };  // GEM's known length, or its estimate from the route
  diameter?: string;         // as GEM gives it: "30, 42 in"
  endpoints?: { start?: string; end?: string };      // GEM's named start and end places
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

// Added 2026-10-28. GEM lists LNG terminals one row per unit (train or regas unit); the import
// groups units by GEM project and facility type. Cancelled and shelved units are left out.
interface LngTerminal {
  id: string;                // gem-<project id>-<export|import>
  name: string;
  aliases: string[];
  facility: 'export' | 'import';
  country: string;           // ISO code; empty when GEM gives none
  point: [number, number];   // first unit with the terminal's status
  pointApprox: boolean;      // GEM Accuracy is not "exact"
  floating: boolean;
  offshore: boolean;
  operator?: string;
  owners?: { name: string; sharePct?: number }[];
  capacityMtpa: { operating: number; planned: number };  // sum of units with a GEM capacity
  units: { name?: string; status: AssetStatus; capacityMtpa?: number; startYear?: number }[];
  evidence: Evidence[];      // GEM's claim (the most live unit's status), after any cited claims from data/curated/lng-evidence.json
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

**Oil terminals (added 2026-10-29):** a curated list of strategic crude terminals, `OilTerminal` in `src/types`. Each links the pipelines that end there and the chokepoints its tankers pass on the way to open sea. There's no capacity field: no comparable source covers them, so a cited average over a stated period (`throughput`) shows instead, as context. Disruptions can name a terminal (`assetKind: 'terminal'`); a pipeline's page also lists the disruptions at the terminals it ends at. The weekly claims refresh covers terminals too, including a search for a first claim where there is none.

## 7. Data sources and jobs

### Sources

| Dataset | Gives | Access | Cadence | License / terms |
| --- | --- | --- | --- | --- |
| [Global Energy Monitor](https://globalenergymonitor.org/) Oil and Gas Infrastructure trackers | Pipeline inventory, routes, capacity, owners | Free download after registration; manual import | Quarterly, by hand | CC-BY 4.0, attribution required |
| GEM Global Gas Infrastructure Tracker, LNG terminals | Export and import terminals by unit: status, capacity (mtpa), owners, location | Free download after registration; manual import (`npm run import:lng`) | Quarterly, by hand | CC-BY 4.0, attribution required |
| Curated evidence file (`data/curated/pipelines-evidence.json`) | Status claims for corridor pipelines | Hand-researched, every claim cited | As events happen | Ours |
| [ENTSOG Transparency Platform](https://transparency.entsog.eu/) | Physical gas flows and technical capacity at EU entry points | Public REST API, no key ([docs](https://transparency.entsog.eu/pdf/TP_REG715_Documentation_TP_API_v1.3.pdf)) | Daily | Check terms; attribute |
| [GIE AGSI+](https://agsi.gie.eu/) | EU gas storage fill by country | REST API, free key via account ([docs](https://www.gie.eu/transparency-platform/GIE_API_documentation_v013.pdf)) | Daily | Check terms; attribute |
| [GIE ALSI](https://alsi.gie.eu/) | Daily send-out and declared send-out capacity by EU LNG import terminal | REST API, same key as AGSI+ (`npm run fetch:alsi`); facilities mapped to GEM terminals in `ALSI.terminals` | Daily | Check terms; attribute |
| [IMF PortWatch](https://portwatch.imf.org/) | Daily vessel transits at chokepoints, by vessel type | ArcGIS FeatureServer, no key: `services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query` (use `n_tanker`, and `capacity_tanker` for estimated tanker cargo in metric tons) | Daily (job runs every 6h) | Check terms; attribute |
| [IMF PortWatch](https://portwatch.imf.org/) | Daily tanker port calls at ports where a mapped pipeline ends (`PORT_CALLS` in config) | ArcGIS FeatureServer, no key: `Daily_Ports_Data/FeatureServer/0/query` (use `portcalls_tanker`, and `export_tanker` for estimated exports in metric tons). Covers few oil terminals; see TODO-research | Daily (same job) | Check terms; attribute |
| EIA World Oil Transit Chokepoints | Reference oil volumes per chokepoint (2024) | Static values, committed in code | Static | Public domain |
| [USGS World Petroleum Assessment provinces](https://sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3) | Basin outlines | Shapefile (14 MB); simplify once with mapshaper, commit result | Static | Public domain |
| Basemap: [OpenFreeMap](https://openfreemap.org/) or [Protomaps](https://protomaps.com/) | Vector tiles | No key | Static | OSM attribution |

The map itself credits only the basemap, as OSM requires. Every data source, with its terms, is credited on the About page in the app menu (moved there 2026-10-29).

EIA reference values (mb/d, 2024, the latest full year in EIA's table, read 2026-10-28): Hormuz 20.7, Malacca 22.5, Suez Canal and SUMED 4.8, Bab el-Mandeb 4.1, Danish Straits 4.9, Turkish Straits 3.6, Panama Canal 2.0 (fiscal year). Suez and Bab el-Mandeb are depressed in 2024 by Red Sea rerouting. Values live in `src/lib/config.ts`.

Note on units: PortWatch counts vessels, EIA measures barrels. Do not compare them directly. Port calls are shown on the pipeline pages as context only, never as status evidence: a tanker at Fujairah or Ceyhan may be loading oil that didn't come down the pipeline. The chokepoint flow index compares tanker transits with their own trailing baseline; the EIA figure is shown as context for scale.

PortWatch's tonnage fields (added 2026-10-29) are estimates, not measurements: each vessel's payload is judged from its draft and multiplied by its deadweight tonnage. They count any liquid cargo a tanker carries (crude, products, chemicals), so they are never converted to barrels. Chokepoint pages show estimated tanker cargo beside the transit count, and port sections show estimated exports beside the calls. The map and the summary still use transit counts. PortWatch asks to be cited as "Sources: UN Global Platform; IMF PortWatch".

### Pipelines to curate for the corridor (v0.1)

Research and cite current status for each. Use `unknown` when a reliable, dated source can't be found.

- **Russia to Europe and Turkey (gas):** Nord Stream 1, Nord Stream 2, Yamal–Europe, Brotherhood/Soyuz (Ukraine transit), Urengoy–Pomary–Uzhhorod (Progress), TurkStream, Blue Stream
- **Southern Gas Corridor:** South Caucasus Pipeline, TANAP, TAP
- **North Africa to Europe (gas):** Transmed, Greenstream, Medgaz, Maghreb–Europe
- **Norway to Europe (gas):** Langeled, Europipe I and II, Franpipe, Zeepipe; Baltic Pipe
- **Eastern Mediterranean (gas):** Arab Gas Pipeline, Arish–Ashkelon
- **Oil:** Druzhba (north and south branches), CPC, BTC, Kirkuk–Ceyhan, East–West (Petroline), Habshan–Fujairah, SUMED, Baltic Pipeline System 1 and 2

Dedup GEM rows against curated rows by name similarity plus endpoint proximity; when they match, the curated record wins and the GEM row's name goes into `aliases`. Log every merge in a report file so it can be reviewed.

As built (M4): each curated record lists its GEM rows by id, checked by hand, and may set `exclude` or turn off automatic matching for systems whose segments share a name (Druzhba). Automatic matches need name similarity of at least 0.6 (Dice on name words, numbers must agree, so "Nord Stream" never matches "Nord Stream 2") and every country of the GEM row on the curated route, which stands in for endpoint proximity. Matches that fail only the country check are logged as near misses. The report is `data/reports/dedup.json`. Merged rows become one record: combined geometry, curated name, route and evidence, GEM operator and owners, and GEM capacity unless the curated record cites its own (TurkStream's two strings). History merges every section's start years, the earliest proposal and construction years, and a stop year only once every section has stopped; length, diameter and end points are kept only for single-row records, since summing parallel strings would mislead. A curated record may cite its own owners (CPC), which replace GEM's owners and parent chain. A curated record may cover one section of a system whose sections differ in state (the Arab Gas Pipeline): it names the `system`, and each pipeline page lists the system's other sections.

### ENTSOG entry points to map first

Identify the right point IDs in ENTSOG and link each to its pipeline. Starting candidates: Greifswald (Nord Stream), Mallnow (Yamal–Europe), Velké Kapušany (Ukraine transit into Slovakia), Strandzha 2 (TurkStream into Bulgaria), Kipi (TANAP/TAP into Greece), Mazara del Vallo (Transmed), Gela (Greenstream), Almería (Medgaz). Verify each against the platform before relying on it.

### Job architecture: fetch, store, read

- Jobs are Node 22 TypeScript scripts in `jobs/`, run by **GitHub Actions on a schedule** (every 6 hours; ENTSOG, AGSI+ and PortWatch daily is enough, but 6h keeps data fresh after delays).
- Each job: fetch, validate (schema check with zod), transform, write JSON to `public/data/<dataset>.json`, write `public/data/meta/<dataset>.json` (`DatasetMeta`), commit if changed. The site redeploys on commit.
- A failed fetch keeps the last good file and records the failure in meta. Never publish an empty or invalid file over a good one.
- Manual imports (GEM, USGS basins) are separate scripts that record source release date and SHA-256 in `DatasetMeta.sourceVersion`.
- The browser only ever reads `public/data/*`. No live calls to upstream sources from the client.
- API keys (AGSI+, also used for ALSI) live in GitHub Actions secrets.
- **Claims refresh (weekly, `.github/workflows/claims.yml`).** For each cited claim older than `STALE_AFTER_DAYS`, Claude Haiku 5.5 searches the web for a newer dated source and drafts a claim. Code then fetches the page and checks the draft: the quote must appear on it word for word, the date must come from the page's own metadata and be no later than its publication date, the claim must be newer than the current one, and the link must not already be cited. A draft that passes, keeps the status we show, comes from a trusted domain (`CLAIMS_REFRESH.trustedDomains`) and whose quote names the asset is committed to `data/curated/`. Any other passing draft opens a pull request. Drafts on pages that can't be read are logged for a saved PDF. Assets with no cited claim and no measured flow (today the oil terminals Ras al-Ju'aymah, Mina al-Ahmadi and LOOP) get a search for a first claim from the last `CLAIMS_REFRESH.firstClaimDays` days; it passes the same checks and always goes to the pull request. Old claims about lasting stops (Brotherhood, Progress, Soyuz) are skipped. The Anthropic key is the `ANTHROPIC_API_KEY` Actions secret; the repository variable `CLAIMS_REFRESH=off` turns the workflow off.
- Measured send-out sets an EU import terminal's status the way metered flow sets a pipeline's: idle at or below `MEASURED_FLOW.idleShare` of declared send-out capacity over 7 days, operating otherwise. Derived in the browser (`withMeasuredLngEvidence`), not stored in `lng-terminals.json`.

## 8. Tech stack

- **App:** Vite, React, TypeScript (strict)
- **Map:** MapLibre GL JS for the basemap, deck.gl layers via `@deck.gl/mapbox` overlay (lines, paths, scatter, polygons)
- **State:** URL as the source of truth for selection and camera; small React state otherwise (no state library unless needed)
- **Charts:** small hand-rolled SVG sparklines (no chart library for v0.1)
- **Claims refresh:** Anthropic's SDK (`@anthropic-ai/sdk`) with Claude Haiku 5.5 and its web search tool (added 2026-10-29 at the owner's request)
- **Icons:** Phosphor (`@phosphor-icons/react`, MIT), imported by name so only the icons used are bundled (added 2026-10-28 at the owner's request)
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

**M6: Where is my oil from?** A US user enters a ZIP code, city or state and sees where the crude refined for their region comes from, and the routes it takes to get there. Detail below.
Done when: entering any US ZIP code or state opens its region's view; every share links to the EIA series it came from, with the month it covers; foreign origins show only the chokepoints a cited route supports; and the location never leaves the browser.

### M6 detail: where is my oil from?

**The question it answers.** "Where does the crude refined for my part of the country come from, and what does it pass through on the way?" Not "where did my gallon come from". Refineries blend crude from many sources, and refined fuel often travels far from the refinery, so no public data traces one community's oil. The view says this in its first line.

**Unit of answer: the PADD.** EIA reports crude movements by Petroleum Administration for Defense District (five regions: East Coast, Midwest, Gulf Coast, Rocky Mountain, West Coast). Every share in the view is a share of one PADD's crude supply. Smaller areas would need refinery-level shipments, which aren't public.

**Location to PADD, in the browser.** The user types a ZIP code, city or state into the existing search. A ZIP maps to a state through a small table built once from the Census Bureau's ZCTA relationship file (public domain); a state maps to its PADD by EIA's published definition. Cities come from the same search index as states (a short list of large US cities with their state). The ZIP or city is never stored, sent anywhere or put in the URL. The URL holds only the region (`?sel=region/padd-3`), which is coarse enough to share.

**Sources (all EIA, public domain, API v2 with a free key, `EIA_API_KEY`):**

| Dataset | API route | Gives | Frequency |
| --- | --- | --- | --- |
| PAD District imports by country of origin | `petroleum/move/impcp` | Crude imports into each PADD, by country | Monthly, about 3 months behind (July 2026 on 2026-10-29) |
| Movements between PAD districts | `petroleum/move/ptb` (and `pipe`, `tb`, `rail` for the mode) | Crude moved from one PADD to another, by pipeline, tanker and barge, and rail | Monthly |
| Refinery and blender net input | `petroleum/pnp/inpt` | Crude run by each PADD's refineries: the total the shares are of | Monthly |
| Crude oil production | `petroleum/crd/crpdn` | Production by state, to say where a PADD's own crude is pumped | Monthly |
| Refinery locations | EIA U.S. Energy Atlas `Petroleum_Refineries_US_EIA` (ArcGIS FeatureServer, from the Refinery Capacity Report) | Operable refineries with location and capacity, for the map | Yearly; manual import |

Company Level Imports (refinery and port of entry for each import, monthly spreadsheet) could later narrow foreign crude to refineries; it isn't needed for PADD shares.

**Method (pure, tested, in `src/lib/oilOrigins.ts`):** over the trailing 12 complete months, for one PADD:

- Foreign: crude imports by country of origin.
- Other regions: crude received from each other PADD, split by mode.
- Own region: refinery crude input minus foreign imports minus receipts from other PADDs. This residual also absorbs stock changes and rounding, so it is labelled "approximately" and shown with the in-region production by state as context, never as a measured flow. If the residual is negative, or imports and receipts exceed refinery input, the own-region share shows as unknown with the reason.
- Shares are shown to the nearest percent with the months they cover. Countries under 1% fold into "other countries".

**Routes.** Each foreign origin is drawn as a path from the country to the receiving PADD's coast, through only the chokepoints a cited source supports for that trade. A curated file (`data/curated/oil-routes.json`) holds, for each exporting country that matters to a PADD, its usual export terminals (linked to the oil terminal layer where we have them), the chokepoints on the way with a source for each, and alternatives where a source names them (for example a Red Sea outlet that avoids Hormuz). Where no source supports a chokepoint, the route shows the country and the receiving coast only. Canadian crude is drawn along the mapped pipelines that cross the border into that PADD, when GEM has them. The view then sums the share of the region's crude whose cited route passes each chokepoint, and shows each chokepoint's current status beside it ("about N% of the region's crude comes by a route through the Strait of Hormuz, now at 2% of normal tanker traffic").

**Panel view (selection kind `region`):** a heading with the region's name; the one-line caveat; a ranked list of origins (country or region, share, how it arrives) where each row selects its route on the map; the chokepoint exposure lines; the region's refineries count and capacity; and a source line with EIA links and the months covered. The map fits to the routes, dims everything else, and shows the region's refineries as small points.

**Not in this milestone:** refined fuel brought in from other regions (EIA product movements between PADDs would give it; a later step), the EU version (Eurostat crude imports by member state), and anything below PADD level.

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
- M6: should the origin shares use the trailing 12 months (steadier, recommended) or the latest month (more current, noisier)?
- M6: which cities should the search know, beyond states and ZIP codes? A list of the largest few hundred US cities is enough to start.
- M6: should refined fuel from other regions (for example Gulf Coast gasoline reaching the East Coast by pipeline) come into the first version? It changes the answer most for the East Coast and West Coast.
- Later: news sources and story placement (asset, then company, then place, then country), and matching companies to assets via GEM's ownership tracker.
