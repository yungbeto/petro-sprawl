# Petro Sprawl: Product Brief

Snapshot of the living product doc as of 2026-10-28. The living version is at https://claude.ai/artifact/ST7c3oPER2WRix9pCS2Qkn. For build details, see [`SPEC.md`](../SPEC.md).

## Purpose

A personal, map-first terminal for understanding world events through the movement of energy and minerals.

The core thesis: the flow of energy explains a lot about why international decisions are made, alliances form, and ruptures occur. The terminal treats oil, gas, coal, power, and critical minerals as the structure beneath diplomacy, and makes that structure visible in real places.

## Audience

Me first, others later. The tool can be opinionated and idiosyncratic now, without onboarding or hand-holding.

- My hand-picked Reuters follow list (538 entries, mostly fossil fuel companies) is the default cast of actors.
- Keep that list as a swappable layer rather than baked in, so the tool can open up to others later.
- Density over explanation: assume the reader knows the territory.

## Core uses

Three uses shape the product. Historical time-scrubbing to test the thesis is out of scope for now.

| Use | What happens | Shapes |
| --- | --- | --- |
| Daily scan | Open it and see what moved since last look | The default screen |
| Event lookup | A headline breaks; check its energy backdrop | Search and auto context |
| Deep dive | Explore one basin, country, or company | Detail panels and filters |

## Questions it should answer at a glance

1. Where is energy moving right now, and has anything changed?
2. What does this country need, and from whom?
3. Who sits on the same resources, and where does that create friction?
4. Which companies are the actors behind a given flow, asset, or place?
5. When a political event happens, what energy context sits underneath it?

## Design principles

- **Map first, as an antidote to abstraction.** News strips away place. Every item lands on the map before it becomes text, so an event stays a real happening in a real location.
- **Even abstract news gets a place.** A policy maps to its jurisdiction, a sanction to the flows it touches, a company story to its assets.
- **Flows over points.** Movement between places is the primary subject; companies and assets are the actors behind it.
- **Local texture.** Selecting an event shows local time, weather, and imagery: cues that people live there right now.
- **Slow fade.** Events persist for a few weeks and fade gradually, so repeated activity in one place becomes visible.
- **Neutral by juxtaposition.** Facts sit side by side (a headline, the pipeline it touches, the companies on that pipeline) and interpretation stays with me.
- **Connections stored as data.** Links between events, flows, places, and companies are real records from day one, so a later nudging feature can surface patterns without a rebuild.

## Scope and platform

| Decision | Choice | Implication |
| --- | --- | --- |
| Energy types | Oil, gas, coal, nuclear, renewables | Asset layers per type |
| Minerals | Critical minerals included (lithium, cobalt, rare earths, etc.) | Deposit overlay alongside basins |
| Platform | Desktop first | Dense layout: large map, side panel, many layers at once; mobile later as a companion |
| Freshness | A few updates per day | Scheduled jobs gather and store data; the page reads stored data, so it loads fast and costs little |
| Time window | Last few weeks | No deep historical archive in v1 |

## Map layers and views

Layers stack from slow geology at the bottom to fast news on top. Basins also work as an organizing view: select one to see the countries on it, the companies operating there, and the news inside its outline.

| Layer | Changes | Role |
| --- | --- | --- |
| News events | Several times a day | Pinned to place, fading over weeks |
| Political overlay | Daily | Sanctions, summits, treaties, conflicts |
| Flows | Weekly to monthly | Trade arcs by volume, pipelines, tanker lanes |
| Chokepoints | Daily | Hormuz, Suez, Bab el-Mandeb, Malacca, Bosphorus |
| Assets | Monthly | Fields, refineries, LNG terminals, plants, mines |
| Companies | Monthly | Ownership linking my companies to assets |
| Mineral deposits | Rarely | Critical mineral mines and districts |
| Basins | Rarely | Petroleum provinces and sedimentary basins |

Other view types to explore: a country dependency view (who it relies on, who relies on it) and a basin view where borders cross shared resources.

## Data sources

All free and open unless noted. Each still needs a check on format, licensing, and update frequency.

| Source | Covers | Notes |
| --- | --- | --- |
| [USGS World Petroleum Assessment provinces](https://sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3) | Petroleum basin outlines worldwide | 76 priority provinces hold 95% of known non-U.S. petroleum; from 2000 |
| [CGG Sedimentary Basins of the World (AAPG)](https://datapages.com/gis-map-publishing-program/gis-open-files/global-framework/cgg-sedimentary-basins-of-the-world) | Sedimentary basins by sub-regime | Free download; AAPG also offers Giant Oil and Gas Fields |
| [NETL Global Oil & Gas Infrastructure basins](https://arcgis.netl.doe.gov/server/rest/services/CO2Locate_GOGI/MapServer/16) | Basin polygons | Queryable as GeoJSON |
| [USGS critical minerals deposits](https://www.usgs.gov/data/global-distribution-selected-mines-deposits-and-districts-critical-minerals) | Mines, deposits, districts for 22 minerals | Public domain; reflects 2017 |
| [Global Energy Monitor](https://globalenergymonitor.org/) | Coal, oil, gas, and power assets of every type | Open trackers, plus an Energy Ownership Tracker to link companies to assets |
| [ENTSOG Transparency Platform](https://transparency.entsog.eu/) | Physical gas flows at EU entry points | Free API; actual flow against capacity |
| [GIE AGSI+](https://agsi.gie.eu/) | EU gas storage fill levels | Free API key |
| [IMF PortWatch](https://portwatch.imf.org/) | Daily vessel transits at chokepoints | Counts ships, not barrels |
| Climate TRACE | Facility-level emissions | To verify |
| AIS ship tracking | Tanker positions | Likely paid for global coverage; optional live layer |
| NASA satellite fire data | Flaring and refinery fires | To verify |
| EIA and Energy Institute Statistical Review | Production, trade, prices | Country-level flows |
| [World Monitor API](https://www.worldmonitor.app/) | News, conflicts, infrastructure signals | Open source (AGPL); possible feed |
| Reuters follow list | My companies | Captured in `data/companies/` |

## Influences

| Reference | What to borrow |
| --- | --- |
| [World Monitor](https://www.worldmonitor.app/) | Closest to the vision: live map, toggleable layers, AI flags when signals converge |
| [Kagi News](https://blog.kagi.com/kagi-news) | A finite daily read with cited sources |
| [Ground News](https://ground.news/) | Showing the shape of coverage, such as Blindspot |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB) | Terminal density; unified access to public datasets |
| Glance | Modular widgets configured by me |
| Prediction markets | A forward-looking probability layer (possible later) |
| Yergin, *The Prize* and *The New Map*; Thompson, *Disorder* | Intellectual grounding for the thesis |

## Decisions

The terminal is my own build, map-first with a single summary panel, and the first prototype slice is energy flows.

### Build approach

Build my own. World Monitor is inspiration and a reference for data and patterns, not a template to clone.

### Default screen

The map is the focal point, with one summary panel alongside, in the spirit of Google Maps and similar map-first interfaces.

- **On open:** the panel summarizes what moved since my last look; the map shows where.
- **Drill down:** selecting anything on the map (a pipeline, chokepoint, basin, story) swaps the summary for that element's details and evidence. Back returns to the summary.
- **Levels:** world, then region or basin, then asset, then the evidence behind its status.
- **Always visible:** how old the data is.

### Visual language

Minimal Swiss and Japanese design meets the Bloomberg terminal.

- A sans serif paired with a monospaced face. Mono for numbers, units, coordinates and timestamps, so figures line up and scan quickly.
- Sentence case throughout; no uppercase eyebrow labels.
- Legibility and scannability first: clear hierarchy, generous spacing, dense where density helps.
- Color reserved for meaning, such as flow, status and data age.
- Font pairings to try: IBM Plex Sans with Plex Mono, or Inter with JetBrains Mono.

### Company list

Captured from my Reuters follows: 538 entries in total (504 companies, 27 topics, 7 entries Reuters mislabels as law firms). Sorted by keyword into groups in [`data/companies/follows-sorted.csv`](../data/companies/follows-sorted.csv); the groups need a skim before use.

| Group | Count |
| --- | --- |
| Upstream oil and gas | 96 |
| Power, grid and storage | 43 |
| Refining and petrochemicals | 41 |
| Oilfield services and equipment | 36 |
| Traders, finance and exchanges | 34 |
| National and state oil companies | 30 |
| Solar, wind and renewables | 30 |
| Pipelines and midstream | 28 |
| Shipping and tankers | 25 |
| Government, regulators and bodies | 23 |
| Integrated and majors | 14 |
| Critical minerals and rare earths | 13 |
| Nuclear and uranium | 9 |
| Fuel retail and distribution | 8 |
| LNG | 6 |
| Hydrogen and new fuels | 6 |
| Coal | 5 |
| Not energy (big tech, food, rail, name collisions like Monster Energy) | 45 |
| Unclear | 19 |
| Reuters topics (LNG, Refining, Pipelines & Transport, Ukraine and Russia at War, and others) | 27 |

About 440 entries are energy actors once duplicates (7 pairs, such as Phillips 66 and Phillips 66 Company) are merged. The 27 Reuters topics can work as filters. Next step: match companies to assets through Global Energy Monitor's ownership tracker.

### First slice: flows

Prototype pipelines and chokepoints, showing capacity against actual flow, with basin outlines as a quiet backdrop. Start with one theater, the Europe, Russia and Middle East oil and gas corridor, where the gap between capacity and flow has been largest since 2022.

- Tests the thesis directly, and the capacity-versus-flow gap is the distinctive idea.
- Free data is ready: GEM pipelines, IMF PortWatch chokepoint transits, EIA baselines, ENTSOG gas flows, GIE AGSI+ storage.
- Exercises the default screen and drill-down from day one.
- Basins cost little to add as context. Company assets come second because they need the company-to-asset matching first.

### News sources and placement (still open)

Findings so far, not a decision:

| Option | Strengths | Limits |
| --- | --- | --- |
| Google News RSS search queries | Free; how World Monitor pulls Reuters energy stories | Unofficial and fragile; headlines and links only |
| Publisher and trade press RSS | Direct and stable where offered | Coverage varies; Reuters has no public feed |
| GDELT | Free, global, geocoded, high volume | Noisy; needs heavy filtering |
| [NewsAPI.ai](https://www.newsapi.ai) (Event Registry) | 150,000 publishers, entity extraction, articles grouped into events | Paid after 2,000 free tokens |
| [GDELT Cloud](https://docs.gdeltcloud.com/api-reference/concepts) | Hourly stories and events; entities include facilities like plants, mines and ports | Newer service; pricing not published |

Proposed placement ladder, most to least precise:

1. **Asset:** the story names a known pipeline, terminal, field or chokepoint, so it lands on that asset. This is where the terminal can beat World Monitor, which matches keywords to about 100 fixed city and country hubs.
2. **Company:** the story names one of my companies, so it lands on that company's assets.
3. **Place:** a named city or region, placed with a geocoder such as GeoNames.
4. **Country:** shaded country outline as the fallback.

The map should show which level placed each story, so a precise point never hides a guess. Extraction can run in the scheduled job a few times a day, where language-model tagging is affordable at this volume.

## Out of scope (for now)

- Investment or trading decisions
- A general news app
- Real-time operations monitoring
- Historical time-scrubbing to test the thesis
- Interpretation or nudging (planned later)

## Open questions

- [ ] Choose news sources: test Google News RSS, GDELT and one paid API on a week of energy stories.
- [ ] Skim the sorted company list and confirm the Not energy and Unclear groups.
- [ ] Match companies to assets through GEM's ownership tracker.
- [ ] Dark theme, light theme, or both? (SPEC builds both and follows the system setting.)
- [x] Where do the scheduled data jobs run? GitHub Actions, writing static JSON (see SPEC).
