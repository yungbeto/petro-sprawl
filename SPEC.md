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

- News event layer and story placement (M9 reads the news only to keep disruptions current, placed on assets; a layer of stories stays later)
- Company layer (the follow list is included as data but not displayed)
- Interpretation or "nudging" features
- Mobile layout
- Historical time-scrubbing (keep only the history needed for baselines)
- Accounts, sharing, alerts

## 4. Default screen

### Layout (desktop, 1280px and wider)

```
+------+----------------------+--------------------------------------+
| (o) Energy terminal         | [Search                   ] Help  ≡  |
+------+----------------------+--------------------------------------+
| Home | Panel (360px)        | (filter chips)                       |
|      |                      |                Map                   |
|      | Summary / Detail     |                                      |
|      |                      |                                      |
| Gear | Updated 3h ago       | [Layers]          scale · attribution|
+------+----------------------+--------------------------------------+
```

- A header row holds the name, the search bar (lined up with the map's left edge; it only opens search), Help (opens About) and the app menu. Below it, a narrow rail on the left holds the app's views, with settings at the bottom; the panel and the map sit beside it as two rounded, bordered cards. Every visit opens on the summary (the home view). Minimizing the panel gives its space to the map; a tab on the map's left edge, the rail's Home button or `[` brings it back, and selecting anything reopens it on that detail. The search never moves (decided 2026-10-30, from a Figma layout, replacing the 2026-10-28 floating search). The rail holds Home and the five surfaces below.
- **Phones** (decided 2026-10-31, after Google Maps, Apple Maps, Uber and Lyft): below 720px wide (`MOBILE` in config) the map fills the screen. The search bar is a floating pill with the menu button beside it, and the filter chips scroll in a row under it. The panel is a bottom sheet resting on a tab bar. The sheet has three heights: peek (the handle and the top of the page: on Home, the latest disruption's name), half and full (up to just under the search pill). Drag the handle or the page's top bar to move it, tap the handle to step up, and a flick carries it on. Below full the page doesn't scroll, so a drag anywhere on it moves the sheet and a tap still opens what's under it. At full the page scrolls, and pulling down from its top lowers the sheet. Opening an item, a surface or a filter lifts it from peek to half. The rail becomes a tab bar of the six surfaces, each an icon over its name; settings stay in the menu. The camera's padding is the search pill and chips above and the sheet and tab bar below, so whatever the map frames sits in the part left showing. The layers button and the credits ride just above the sheet and hide when it's full; the scale bar and key hints are left out. Search and the menu take the whole screen. Tablets and landscape phones keep the desktop layout.
- **Explanations** (decided 2026-10-30): how a figure is made and what it leaves out sits behind an ⓘ beside the title it explains (`src/panel/Info.tsx`, a native popover that Escape or a tap outside closes). What a reader needs every time, such as the period a figure covers, stays on the page.
- **Views** (decided 2026-10-30): a rail view is a mode, `view=<id>` in the URL. It fills the panel with a list, sets what stays bright on the map (as a filter does) and frames its assets on opening. It stays lit while you open things from it, so Back from an item returns to the view's list, and pressing it again does the same; Home leaves it. The panel shows, in order: the selection, the filter's matches, the view's list, the summary. Views are defined in `src/lib/views.ts`.
  - **Chokepoints:** every strait, furthest from its five-year average first: the share, a 90-day transit line against the five-year average, transits a day, and tanker cargo as a share of its own five-year average. Straits without transit data follow, by name, with EIA's reference volume. The map keeps the chokepoints and the oil terminals whose cargo passes one.
- **Surfaces** (decided 2026-10-30): the rail follows the kinds search groups by, where a kind has live state to rank. Basins are context with no status or flow, so they stay a layer and a search group. Places split, because storage countries and US places answer different questions.
  1. **Home:** the summary across every surface. A hero leads, laid out like the "what's happening" lists on Twitter, Bluesky and Reddit (decided 2026-10-30): "What's happening" with the date, and what the site is in one line. Then the lead story: a newspaper icon and "Latest update · 3 days ago", the asset's name (opening it), the first sentence of the summary, and a byline of the asset's kind, the cause and the newest source. Then "Also in effect", with how many in all and on what, and the others with no end date (three before "Show all", each opening its asset and naming its kind and start). The lead and the list are ordered by each disruption's newest report (`lastReported`, the latest `publishedAt` among its sources), not by when it started (decided 2026-10-31, M8): a new report on a months-old disruption brings it back to the top, so "Latest update · 3 days ago" is the date of that report (`dateAgo`; the date once it's older than two weeks). A row whose newest report is older than `STALE_AFTER_DAYS` says "no report since <date>", the same aging claims get. Then "Measured changes" (M8): what the meters and ship counts show moving over the latest week of data, each opening its asset. "Where is my fuel from?" lives on the Fuel origins surface only. Four figures follow, two by two (pipelines, terminals, chokepoints, EU gas storage), each opening its surface, then what changed since last visit. Each surface's own table has moved to that surface.
  2. **Chokepoints** (built): straits by flow against baseline.
  3. **Pipelines** (built): every mapped pipeline, with the status split overall, grouped by region (the World Bank region of the start country, from Natural Earth), status, commodity or owner (the parent with the largest share, as GEM traces it; the top 30, then other owners). Groups show a count and a status bar; opening one lists its pipelines, researched ones first, brings them out on the map and frames them. Operator isn't a grouping: only researched lines carry one.
  4. **Terminals** (built): LNG or oil terminals, with a switch between them, each with its status split. LNG terminals (all GEM tracks) group by facility (export or import), region or status, with measured or cited terminals first and then the largest by capacity in operation. Oil terminals (the curated set) group by route (the straits a tanker leaving has to pass, open sea last), region or status. The switch keeps its kind bright on the map; an open group narrows that to the group and frames it. Chips: offline or idle, unverified claims, metered flow (gas and oil would repeat the switch).
  5. **Gas storage** (built): each country AGSI+ reports, furthest below the same date last year first, with its fill as a bar, a tick at last year's level, and the 7-day change. Opening it turns the storage layer on, fades every asset and frames Europe (`STORAGE_BOUNDS`). No chips: storage is a layer of countries, not assets.
  6. **Fuel origins** (built, `view=origins`): a button that opens search on US places (ZIP code, city or state), a fuel switch (gasoline, diesel and heating oil, jet fuel, crude), then the five US regions with their three largest sources for that fuel. A region opens on the chosen fuel. The map shows only the five regions, as outlines of their states merged (Census 1:20m, `import:us-regions`), with every other layer and the layers button off; tapping a region opens it (decided 2026-10-30). It frames the lower 48 (`US_BOUNDS`). An open region, from here or from search, keeps that map: its outline drawn stronger and its origin arcs, framed on its contiguous states and the arcs. Opening anything else brings the layers back. No chips.
  7. Settings, at the bottom.

  Each surface owns its list, what stays bright on the map, what it frames, and its filter chips, which count and match within the surface only. Search's groups follow the rail: Places becomes Countries and US places, and Basins stays a search-only group. Disruptions attach to assets, so they show in each surface and on Home rather than as a surface of their own. A table on Home moves to its surface once that surface is built. Hold further surfaces (European gas flows, evidence) until one of these proves thin.
- A compact Layers button sits at the map's bottom left; the layer list opens above it and closes on `L`, Esc or a click elsewhere. Layers default to on, except EU gas storage (see section 5). The top edge is left to the filter chips (decided 2026-10-28, after Google Maps).
- Initial camera frames the theater (roughly lon -15 to 65, lat 10 to 72).

### Panel states

1. **Summary (default on open)**
   - A dashboard of four tiles leads the panel, one number each with a small picture: chokepoints below baseline (a ring per chokepoint, the worst named), pipelines offline or idle (a status bar), EU storage countries below last year (a tick per country around zero, with the median gap), and changes since last visit. Each tile opens what it counts: its filter, the storage layer, or the changes list (decided 2026-10-28).
   - "What changed since last visit" list: status changes, flow swings, storage moves. Each row links to the asset on the map. Last visit timestamp lives in `localStorage` (wrapped in try/catch; render fine without it). Switched off behind `FEATURES.visitChanges` (decided 2026-10-31): unsure about keeping a record of each visit, even one that never leaves the browser. Off, nothing is stored, a stored snapshot is removed, and Home shows neither the count nor the list. The code and its tests stay for turning it back on.
   - Data age in the panel footer ("Updated 3 h ago"), which opens the app menu at the full freshness table.
   - As built (M5): storage is counted by country ("16 of 20 countries below the same date last year") rather than as one EU fill, because a fair EU figure needs each country's working gas volume. Loads less than 30 minutes apart count as one visit, so a reload doesn't swallow the changes. Flow swings are listed at 15 points of capacity or more, storage moves at 2 points or more (`CHANGES` in `src/lib/config.ts`). A load where a dataset failed isn't saved as the next visit's baseline.
2. **Pipeline detail:** name, commodity, route (from → transit → to), operator and owners, capacity, age (year in service) and history, length and diameter, current status with its evidence (source type, statement, link, date), measured flow where available (sparkline, last 90 days, flow as share of capacity), disruption history.
3. **Chokepoint detail:** EIA reference volume (mb/d, 2024), daily tanker transits with the 7-day average against two baselines: the trailing 365-day average and the five-year average before that year. Flow index for each, 90-day sparkline with both baselines drawn, and sourced disruptions. The map colors by the five-year index, because a trailing year absorbs a long disruption within twelve months (decided 2026-10-28, after Hormuz transits fell from about 43 a day to about 1 in March 2026).
4. **Basin detail:** name, countries it spans, pipelines and chokepoints inside or touching it.
5. **Storage detail (country):** fill level, trend, same date last year.
6. **Detail layout, all kinds** (decided 2026-10-28): a header with the kind icon, the kind and the name; then what the asset is about, largest (a pipeline's status and its evidence, a chokepoint's or a country's headline figure); then a strip of two or three key numbers; then charts, disruptions and reports; then secondary facts under "Details"; sources last. Related assets (a basin's pipelines and chokepoints) are rows with icon and status, counted in the heading, corridor pipelines first, the first six showing and the rest behind "Show all" (`DETAIL.relatedLimit` in `src/lib/config.ts`).
7. **Reports** (decided 2026-10-30): every dated claim behind a status is an item of its own under "Reports", newest first: the status it supports, the kind of source, who it credits and the date, the statement as plain text, and "Read on <site>" linking out (`reportParts` splits the closing credit from the statement). The status card names the current one in a line ("Press report from Bloomberg, via Energy Connects, 2026-09-04"). Datasets join the list when a report sits beside them; meters show with their charts.

### Interactions

- **Hover:** highlight the feature and show a minimal tooltip (name plus one key figure).
- **Click:** select it, fly the camera to fit, open its detail in the panel.
- **Back and close** (decided 2026-10-30, replacing the search bar's title and × from 2026-10-28, which suited a Google Maps layout but not one with a rail): an item or a filter list in the panel has its own top bar. Close (×, "Close, back to Home" or the view's name) returns to the page of the surface chosen in the rail: the summary, or the view's list. Between them the bar names what kind of thing is open ("LNG export terminal", "Gas pipeline · corridor", "Map filter"), and the detail below leads with the name (decided 2026-10-30). A back arrow ("Back to <name>" as its label and tooltip) appears at the bar's left when the item was opened from another item or list in the same surface, and steps back one; Esc and the browser's Back do the same. A shared link has nothing to go back to, so it shows Close only. Each page opens at its top. Selection and camera are in the URL (shareable, reloadable).
- **Search:** a dialog over the app, opened from the header's search bar, `/` or ⌘K (decided 2026-10-30, once there were seven kinds to search). One box searches chokepoints, pipelines, oil and LNG terminals, countries, basins and US places (regions, states, cities, ZIP codes). Results come in groups by kind, ordered by each group's best match, a few of each (`SEARCH` in config); a scope row (all, chokepoints, pipelines, terminals, countries, US places, basins, following the rail's surfaces) narrows to one and shows more, and lists that scope with nothing typed. An empty box lists the views. Arrow keys move, Enter opens, and Esc (from anywhere while it's open) or its close button closes it; focus returns to the bar.
- **App menu:** a menu button at the left of the search bar opens a drawer over everything with app-level settings and information: theme, data freshness for each dataset, every dataset's source and license as its job recorded them, keyboard shortcuts, and a short about. Esc or the backdrop closes it (decided 2026-10-28, after Google Maps' main menu).
- **Quick filters:** a row of chips over the map: offline or idle, below baseline, unverified claims, metered flow, gas, oil, each with its match count. One at a time; matches stay at full strength on the map, the rest fade, and the panel lists the matches in place of the summary. The filter is in the URL (`f=`), and Back or Esc clears it (decided 2026-10-28, after Google Maps' category chips).
- **Keyboard:** `/` or ⌘K opens search, `Esc` goes back, `L` toggles the layer control, `[` minimizes or reopens the panel.

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
- Measured changes (M8) are derived in the browser too, from the series already published, so they need no job of their own and move with every data commit.
- **News scan (M9, every 12 hours, `.github/workflows/news.yml`).** Reads energy news to keep disruptions current: a new report on a disruption in effect, a new disruption, or its end. Same pattern as the claims refresh: Claude drafts, code checks every draft against the page, only low-risk drafts are committed, the rest open a pull request. See M9.

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

- **Type:** Inter for interface text, IBM Plex Mono for numbers, units, coordinates, timestamps and IDs (Google Fonts). Use tabular figures. Inter replaced IBM Plex Sans on 2026-10-30, with the Figma layout.
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
| Refinery count and capacity | `petroleum/pnp/cap1` | Operable refineries and atmospheric distillation capacity per PADD, as of 1 January | Yearly |
| Refinery locations | EIA's `Petroleum_Refineries_US_EIA.zip` shapefile (2021; the Atlas FeatureServer needs a token) | Capacity-weighted centre of each PADD's refineries in the lower 48: the end point of the arcs | Manual import (`import:us-lookup`) |

Company Level Imports (refinery and port of entry for each import, monthly spreadsheet) could later narrow foreign crude to refineries; it isn't needed for PADD shares.

**Method (pure, tested, in `src/lib/oilOrigins.ts`):** over the trailing 12 complete months, for one PADD:

- Foreign: crude imports by country of origin.
- Other regions: crude received from each other PADD, split by mode.
- Own region: field production in the PADD's states and federal offshore areas.
- Shares are of the sum of the three, all measured. A first version took the own share as refinery input minus imports and receipts; that came out negative for the Midwest (−15%), because much of the crude flowing in moves on to the Gulf Coast. So the view describes the crude flowing in, says that some of it moves on, and shows refinery runs beside it rather than as the total.
- Shares are shown to the nearest percent with the months they cover. Countries under 1% fold into "other countries".

**Routes.** Each origin is drawn as a schematic great-circle arc from the country's label point (Natural Earth), or another PADD's hub, to the region's hub, with width by share. The arcs show where crude comes from, not the path it takes. A curated file (`data/curated/oil-routes.json`) holds, for each exporting country with a cited route, the export terminals it loads at, as ids in the oil terminal layer. The chokepoints come from those terminals' `exitVia`: a share is certain only when every listed terminal passes the chokepoint, otherwise it shows as "up to". Countries without a curated route show no chokepoints. The first version covers Saudi Arabia and Iraq; drawing Canadian crude along the GEM pipelines is a later step. The view then sums the share of the region's crude whose cited route passes each chokepoint, and shows each chokepoint's current status beside it ("about N% of the region's crude comes by a route through the Strait of Hormuz, now at 2% of normal tanker traffic").

**Panel view (selection kind `region`):** a heading with the region's name; the one-line caveat; crude in, refinery runs, and the refineries count and capacity; a ranked list of origins (country, other region or own production, share, how it arrives or where it's pumped), where another region's row opens that region; the chokepoint exposure lines, each opening its chokepoint; the cited route notes; and a source line with EIA links and the months covered. The map fits to the arcs and keeps the chokepoints and terminals on cited routes at full strength. The summary lists the five regions with their largest source.

**Not in this milestone:** refined fuel brought in from other regions (EIA product movements between PADDs would give it; a later step), the EU version (Eurostat crude imports by member state), and anything below PADD level.

**M7: Where is my fuel from?** The region view also answers for the fuel people put in their cars, trucks and planes: gasoline, diesel and jet fuel, wherever it was refined. Detail below.
Done when: a region opens on gasoline, with diesel, jet fuel and crude a click away (and in the URL); every share links to its EIA series with the months it covers; each other-region row opens that region; and no share is a residual of two measured series unless it says so.

### M7 detail: where is my fuel from?

**Why.** M6 follows crude to a region's refineries, but much of the fuel a region burns is refined somewhere else. Over the twelve months to July 2026 the East Coast's refineries ran about 0.8 million b/d of crude. In July alone the region used about 3.1 million b/d of gasoline, and about 2.1 million b/d of gasoline and blending components arrived from the Gulf Coast by pipeline, tanker and barge. For most readers the honest first answer is "your gasoline was mostly refined on the Gulf Coast", then "from this crude".

**Products.** Gasoline (finished motor gasoline `EPM0F` plus gasoline blending components `EPOBG`, since most gasoline moves as components and is finished at terminals), distillate fuel oil as "diesel and heating oil" (`EPD0`), and kerosene-type jet fuel (`EPJK`). Fuel ethanol (`EPOOXE`) is shown as its own row under gasoline, because the ethanol in a gallon is mostly made in the Midwest and arrives by rail, separately from the gasoline. EIA publishes no product supplied for ethanol by PADD, so ethanol counts in gasoline's inflow and the share is of finished gasoline used, which includes the ethanol blended into it.

**As built.** The data is `public/data/fuel-origins.json`, one record per PADD and fuel, written by `fetch:eia` beside `oil-origins.json`. Over the twelve months to July 2026 no region and fuel needed the "shares of what flowed in" fallback.

**Sources (EIA API v2, the same key and job as M6):**

| Dataset | API route | Gives |
| --- | --- | --- |
| Movements between PAD districts | `petroleum/move/ptb` (and `pipe`, `tb`, `rail`) | Each product received from each other PADD, and how |
| Imports by PADD of entry | `petroleum/move/impcp`, process `IM0` | Each product imported into the PADD, by country |
| Product supplied | `petroleum/cons/psup` | What the PADD used of each product: the total the shares are of |
| Refinery and blender net production | `petroleum/pnp/refp` | Context only. For gasoline it counts blending of components received from elsewhere, so it is never used as "made in the region" |

**Method (pure, tested, in `src/lib/fuelOrigins.ts`):** over the trailing 12 complete months, for one PADD and one product:

- Other regions: receipts from each other PADD, as a share of the PADD's product supplied, with the main mode.
- Imports: by country, as a share of product supplied. Countries under 1% fold into "other countries".
- In the region: what's left, product supplied minus receipts and imports. It covers local refining, blending and stock changes, so it is labelled "made in the region or drawn from stocks", never as a measured flow.
- If what's left is negative (the region passes fuel on to another region or abroad), the view shows shares of what flows in instead and says why, as M6 does for crude.
- Shares to the nearest percent, with the months they cover and the barrels a day they come to.

**Panel view.** The region view gains a fuel switch above "Where it comes from": gasoline (the default), diesel, jet fuel, crude. The choice goes in the URL (`?sel=region/padd-1&fuel=diesel`) so a view can be shared. For a refined fuel the list shows other regions, imports by country and the in-region remainder; another region's row opens that region on crude, which says what its refineries run on. The chokepoint section appears for crude only; product imports have no cited routes yet. The summary's "Where is my oil from?" table shows each region's largest gasoline source.

**Map.** The arcs follow the selected fuel: from other regions' hubs and importing countries to the region's hub, width by share, as in M6.

**Not in this milestone:** blending each source region's crude mix into a "crude behind your gasoline" figure (it would chain two sets of shares and hide how rough that is); chokepoints for product imports; anything below PADD level.

**M8: A home page that moves with the data.** The "What's happening" hero changes from day to day without anyone editing it: the lead story follows the newest report, and measured changes from the data already fetched sit beside the reports. Everything is derived in the browser from published files. Detail below.
Done when: a new source on an old disruption makes it the lead story; a disruption with no report in `STALE_AFTER_DAYS` says so; measured changes list every pipeline, LNG terminal and chokepoint past its threshold in the latest week of data, each worded as what was measured and never why; and the rules are pure, tested and in `src/lib/config.ts`.

**M9: News that keeps disruptions current.** A scheduled job reads energy news, matches stories to mapped assets, and drafts new reports, new disruptions and end dates, each checked in code against the page it cites. Detail below.
Done when: a run on a week of real news adds at least one verified report to a disruption in effect, opens a pull request for anything new, suggests an end date only with a cited source, logs its cost, and can be turned off with a repository variable.

### M8 and M9 detail: a self-updating "What's happening"

**Why.** Disruptions are hand-curated, so the hero only changed when someone edited `data/curated/disruptions.json`, and it was ordered by start date, so the newest report on Hormuz (started March) could never lead. Trending lists on Twitter, Bluesky and Reddit work by spotting what is moving against its own normal, grouping mentions into one story, ranking, and only then naming it. This site has its own version of each step: a measured series against its own recent weeks is the spike, an asset is the story mentions group into, and a cited source is the name. The aim is a hero that keeps itself current while never saying something no source or meter supports.

**Order by newest report (M8).** `lastReported(d)` is the latest `publishedAt` among a disruption's sources, falling back to `startedAt`. The hero's lead and "Also in effect" sort by it, newest first, then by start. The kicker reads the report's age; its tooltip gives the report date and the start. "Also in effect" rows keep "since <start>" and add "no report since <date>" once the newest report is older than `STALE_AFTER_DAYS`: an ongoing disruption ages the way a claim does, and a quiet one is a candidate for an end date (M9).

**Measured changes (M8, `src/lib/measuredChanges.ts`).** For every series linked to a mapped asset, compare the mean of the latest `MEASURED_CHANGES.recentDays` (7) days of data with the `priorDays` (28) days before them. Windows end on the series' own latest point, as the flow index does, and a series whose latest point is older than `maxAgeDays` is skipped, so a stalled feed never reads as news.

| Asset | Series | Counts as a change | Why |
| --- | --- | --- | --- |
| Chokepoint | PortWatch tanker transits | 7-day mean up or down at least `transits.minRelative` (25%) on the prior 4 weeks, when the prior mean is at least `transits.minPriorMean` (3 a day) | Below 3 a day (Hormuz since March) a single ship is a large share |
| Pipeline | ENTSOG physical flow | Flow stopped (at or below `MEASURED_FLOW.idleShare` of capacity, from above it), resumed, or moved at least `CHANGES.flowSharePts` (15) points of capacity | Pipelines run steadily, so a swing of a sixth of capacity is unusual |
| LNG import terminal | GIE ALSI send-out | Send-out stopped or resumed only | Send-out follows cargo arrivals and swings 50% week to week as a matter of course (read on 2026-10-31 data) |

Each change says what moved, by how much, over which dates, and which meter or count says so ("tanker transits down 32% on the 4 weeks before, 7 days to 2026-10-25"). It never names a cause: that is what reports are for. Stops and restarts come first, then the largest relative moves. Port calls stay out: they are context, never status (section 7). Three show before "Show all"; with none past a threshold the section says so.

**News scan (M9, `jobs/scan-news.ts`, `npm run scan:news`, every 12 hours).**

1. **Collect.** Recent articles from the GDELT DOC 2.0 API (free, no key, `api.gdeltproject.org/api/v2/doc/doc`, article lists over the last few days, energy themes) and a short list of publisher RSS feeds in `NEWS.feeds`. Each source's terms are checked before it is relied on and noted in `TODO-research.md`. Only headlines, links and dates are kept, under `data/reports/`, not the articles.
2. **Match to assets.** A pure, tested `matchAssets(title)` finds mapped assets by name and alias: curated pipelines, chokepoints, oil terminals, and LNG terminals with cited evidence. Word-boundary matches only, with a stop list for names that are also common words or places. Articles with no asset are dropped: the placement ladder's asset rung (product brief) is the only one in this milestone.
3. **Rank.** Articles on one asset within `NEWS.windowHours` form one story. A story is a candidate when `NEWS.minPublishers` distinct publishers carry it, or one trusted domain (`CLAIMS_REFRESH.trustedDomains`) does, or it lines up with a measured change on the same asset (M8). At most `NEWS.maxStoriesPerRun` go to the model, largest first, so the cost has a ceiling.
4. **Draft.** After a headline-only triage (see as built), Claude Haiku 5.5 reads the candidate's pages and the asset's disruptions in effect, and drafts one of: a source for a disruption in effect, a new disruption, an end date for one in effect, or nothing.
5. **Check in code** (`verifyDraft`, as for claims): the page must load, the quote must appear on it word for word and name the asset, the date must come from the page's own metadata, and the URL must not already be cited. A draft that fails is logged, never published.
6. **Publish by risk.** A new source on a disruption in effect, from a trusted domain, is committed to `data/curated/disruptions.json` (and with M8's ordering, it moves the hero). New disruptions, end dates, changes of cause and anything from other domains go to `data/reports/disruption-drafts.json` and the review pull request, as first claims do. Every outcome and the run's cost go to `data/reports/scan-news.json`.

**End dates (M9).** Nothing ends a disruption by itself. The scan looks for an end report for each disruption in effect where (a) the measured series behind its asset has been back near its baseline for `NEWS.recoveryDays` (a chokepoint's five-year index in the near band, a pipeline's or terminal's flow above idle), or (b) its newest report is older than `NEWS.quietDays`. A cited end report becomes a suggested `endedAt` in the pull request; recovered flow alone is never enough, because a meter says gas is moving, not that a dispute is settled.

**Secrets and switches.** The same `ANTHROPIC_API_KEY`; the repository variable `NEWS_SCAN=off` turns the job off. The scan runs in the data workflow's concurrency group, so its commits never race the fetches.

**As built (M9, 2026-10-31).**
- *Feeds.* Both GDELT and Google News RSS (decided 2026-10-31), queried for the shortest strong names of each asset, eight to a query, over the last 3 days. Google News links are Google redirects that can only be resolved through an undocumented endpoint, so Google News items rank stories and name publishers but are never drafted from directly: the article comes from a GDELT link to the same story, or Claude searches the publishers' own sites for it (`NEWS.maxSearches`, dropping sites that block Anthropic's crawler). Each run tries Google News first; a run where it fails scans GDELT only, and three failed runs in a row turn the workflow red (`news-state.json` keeps the count), as does a run where neither feed answers. GDELT answers 429 at its documented 5-second pace and, from a home connection on 2026-10-31, to nearly every request, so requests are 8 seconds apart with a 30-second backoff, three failures in a row skip it for the run, and its failing alone is only logged. Google News's feed terms allow personal, non-commercial use; see TODO-research.
- *State.* Headlines seen in the last 21 days, end checks and Google News health live in `data/reports/news-state.json`, committed each run, so the same headline is never drafted from twice.
- *Unreviewed sources* (decided 2026-10-31). A source committed without review carries `unreviewed: true`. Each disruption's source list shows its headline and "Not yet reviewed: added automatically from the news. Read the source to check it." beside the link; when it is the lead story's newest source, Home's byline says "not yet reviewed" and a line gives the headline and a link to it. Sources applied from the review pull request carry no mark; to mark an auto-committed one reviewed, delete its `unreviewed` field.
- *Triage.* Before any page is read or searched, Haiku sees only the story's unseen headlines, the disruptions in effect and the reports already cited, and picks the one headline worth drafting from, or none (about $0.001). The draft then reads that article, or searches that publisher's site for it.
- *Cost.* About $0.002 a story when the article can be read from a GDELT link, $0.02 to $0.03 when Claude has to search for it, and about $0.05 an end check. Runs stop drafting at `NEWS.maxCostPerRunUsd` ($0.25), so at most about $15 a month. The first three runs, on 2026-10-31 with GDELT throttled so every draft searched, cost $0.15, $0.19 and $0.13 (with triage): expect about $8 a month while GDELT stays unreachable, less when it answers.

**Not in these milestones:** a news layer on the map, placing stories by company, place or country, story clustering beyond one asset, and showing headlines that aren't attached to a disruption.

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
- M6 decided: shares over the trailing 12 months; the 300 largest US cities in search; refined fuel from other regions left out of the first version.
- M7 decided: the region view opens on gasoline; distillate is labelled "Diesel and heating oil".
- M9 decided 2026-10-31: GDELT and Google News RSS, falling back to GDELT alone when Google News fails; every 12 hours; a new source from a trusted domain on a disruption in effect is committed without review and marked as unreviewed on the page.
- Later: story placement beyond assets (company, then place, then country), and matching companies to assets via GEM's ownership tracker.
