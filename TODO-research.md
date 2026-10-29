# Research to do

Items that couldn't be sourced or that need a decision. See CLAUDE.md: unsourced values stay `unknown` until resolved here.

## Chokepoints

- ~~EIA reference volumes differed from SPEC section 7.~~ Resolved 2026-10-28: using EIA's 2024 column (latest full year), SPEC updated. Note that 2024 Suez (4.8) and Bab el-Mandeb (4.1) reflect Red Sea rerouting, about half their 2023 levels.
- **Danish Straits:** PortWatch's `chokepoint10` is the Oresund only. EIA's Danish Straits figure includes the Great Belt, where most large tankers pass. Check whether PortWatch publishes a Great Belt series; if not, the M3 flow index for this chokepoint tracks Oresund traffic only and the panel says so.
- **Turkish Straits:** PortWatch's `chokepoint3` is the Bosporus; EIA reports the Turkish Straits at the Dardanelles. Probably the same tanker traffic, but confirm.

## Basins

- ~~Countries each basin spans.~~ Done 2026-10-28 with Natural Earth 5.1.1 1:50m admin-0 (public domain), used at import only. Rule in `BASIN_COUNTRY_OVERLAP`: at least 1,000 km² of land overlap, or at least 20% of the country.
- **Offshore basins have no countries.** South Barents, Vestford-Helgeland, North Sea Graben and Provence overlap no land, so the panel says so. Naming the coastal states would need maritime boundaries (for example Marine Regions EEZs, CC BY); decide if it matters.
- USGS provinces date from the 2000 World Petroleum Assessment. Fine as a backdrop; note the age in the basin detail if it matters.

## Pipelines

- **GEM rows without a route can't be drawn.** 530 gas rows and 332 oil rows worldwide have no geometry and no endpoint coordinates, so the SPEC's great-circle fallback has nothing to connect. Some are in the theater (for example Druzhba's Freundschaft 1 and 2 segments). Endpoints would need geocoding from `StartLocation` / `EndLocation`; decide in M4 alongside the curated list.
- ~~`geometryApprox` covers GEM's low-accuracy routes.~~ Confirmed 2026-10-28; SPEC 5 updated.
- **GEM status is a dataset claim with old dates.** It goes in as `sourceType: 'dataset'` dated by GEM's `LastUpdated`. Since M4, cited claims outrank it whatever the dates (SPEC 6); GEM's claim stays in the status history.
- **GEM statuses with no match in ours:** `shelved` and `mixed status` map to `unknown`, `mothballed` to `idle`, `retired` to `offline`. Cancelled and shelved rows are not imported.
- One gas row (`gem-p5854`) lists its country as "Kuwait-Saudi Arabia" (the former neutral zone); it's kept with that country left out.

## Disruptions and reporting

- Two sourced records so far (`data/curated/disruptions.json`): Hormuz, cited to CRS R45281 (2026-08-07), the Commons Library briefing CBP-10636 (2026-06-08) and News On AIR (2026-04-10); Bab el-Mandeb, cited to CNBC (2026-07-22) and Al Jazeera (2026-08-12). Both need later sources as events move: for example the IRGC closure declaration of 2026-10-26 and the IMO mine warning of 2026-10-27, which showed up only in secondary aggregators. Find primary or wire reports before adding them.
- The International Crisis Group website returns 403 to automated requests. Its RSS feed (`https://www.crisisgroup.org/rss.xml`) works, but carries only the 10 latest items, with titles and links and no article text. The Commons Library briefing CBP-10636, CNBC and congress.gov (CRS R45281) also blocked automated reads; the user saved them as PDFs in `docs/research/`. Blocked sources can be read that way, but the cited URL stays the publisher's.
- The Red Sea attacks of 2023 to 2025, which explain Bab el-Mandeb and Suez running at about half their 2023 levels in 2024, have no disruption record yet.

## Curated corridor pipelines (M4)

Nineteen corridor pipelines are curated in `data/curated/pipelines-evidence.json`. Eleven have cited status claims: Nord Stream 1 and 2, Brotherhood, Progress, TurkStream, Druzhba south, Kirkuk–Ceyhan, East–West, and (added 2026-10-28) Habshan–Fujairah, SUMED and Arish–Ashkelon. Eight are curated so ENTSOG flows can attach, with status left to measured flow and GEM: Yamal–Europe, TAP, Transmed, Greenstream, Medgaz, Langeled, Franpipe and Zeepipe.

- **Still to research and cite** (SPEC 7 list): Soyuz, Blue Stream, South Caucasus, TANAP, Maghreb–Europe, Europipe I and II, Baltic Pipe, Arab Gas Pipeline, Druzhba north, CPC, BTC, Baltic Pipeline System 1 and 2. Leads found but not used:
  - CPC: Novorossiysk terminal attacks reported through 2025 and 2026. Several search results carried 2026 URLs over 2025 articles, so check the date on the page itself.
  - Habshan–Fujairah: attacks on Habshan and Fujairah in March to May 2026, in paywalled MEED and secondary sources.
  - Yamal–Europe: Russia banned Gazprom from the Polish section in May 2022 (Bloomberg, paywalled). ENTSOG shows zero flow at Mallnow in both directions.
  - Maghreb–Europe: Algerian flows stopped November 2021; reverse flows to Morocco since 2022. Needs a primary source.
- **Gulf and Red Sea bypasses (2026-10-28).** CNBC, Ahram Online, EnergyNow, Israel Hayom and MEES blocked automated reads. If they're saved as PDFs in `docs/research/`, these can be firmed up:
  - Habshan–Fujairah: the latest claim is from 15 May 2026, so it shows as unverified. Fujairah loadings were disrupted by drone attacks around 14 and 15 March 2026 and resumed (EnergyNow, blocked); that's a port disruption, which the disruption model can't attach to a pipeline yet. Capacity is cited as 1.5 mb/d (Al Jazeera); GEM gives 1.8, and other reports give 1.8 as a surge figure.
  - SUMED: Sidi Kerir loadings of about 2.1 to 2.2 mb/d in August 2026 (Kpler via Ahram Online and CNBC, both blocked) would be a better claim than the LSEG remark now used. Kpler's own factbox has no date on the page. Loadings are tracked cargoes, not metered pipeline flow.
  - Arish–Ashkelon: The National (2026-04-07) reports Israeli pipeline supplies to Egypt and Jordan curtailed for several weeks under force majeure during the Iran war, then back near pre-war levels from 3 April. It doesn't name the pipeline, so it isn't attached; find a source that names EMG to record the outage.
  - Arab Gas Pipeline: not curated. GEM splits it into six segments with different states (the Homs–Lebanon spur is idle), and one curated record would give them all one status. Jordan has sent gas north to Syria since January 2026; Lebanon's link is under repair. Decide whether curated records should cover segments separately.
- **East–West, September 2026.** Al Jazeera (2026-09-17) reported the drone attacks halted flow, with repairs expected to take three to five weeks (AP). The minister later said it was back in use within five or six days (Al Jazeera, 2026-10-06). The disruption record follows the later statement; the conflict is unresolved.
- **Progress and Brotherhood both cite the GTSOU statement about Sudzha.** The statement names the Sudzha entry point, not the pipelines. Both lines entering at Sudzha is general knowledge rather than something the source says; find a source that names them.
- **Druzhba south after April 2026.** The latest verified source is the 24 April restart. One search summary mentioned a halt in late July 2026, but its source turned out to be an August 2025 article. The claim shows as unverified until a newer source is found.
- **Kirkuk–Ceyhan and East–West carry flow figures in their claims** (about 250,000 b/d against 1.4 mb/d of GEM capacity; 5.8 of 7 mb/d). Status stays `operating` because no source calls them reduced.

## ENTSOG

- Points were checked against `operatorpointdirections` on 2026-10-28. No data at Greifswald (Nord Stream), at Dornum and Emden from the Gassco side (Europipe I and II), or at the DESFA Kipi entry (TANAP into Greece). Europipe may report on the German TSO side under another key; worth a second look.
- TurkStream is measured at Strandzha 2, the European line only. Deliveries to Turkey aren't on ENTSOG.
- Easington, Dunkerque and Zeebrugge ZPT are the landing points of Langeled, Franpipe and Zeepipe. Each point may also carry other lines; Easington, for example, has other North Sea landings. Treat the measured flow as the point's flow.

## AGSI+

- Country list and slugs checked on 2026-10-28 against the provider listing from agsi.gie.eu. Serbia isn't covered. Ireland's only site (Kinsale Southwest) is decommissioned. The UK's current data is under `GB*`; `GB` is the pre-Brexit series and is empty now.

## M5

- An EU-wide storage fill for the summary. AGSI+ publishes EU aggregates, but the job only fetches countries; check the aggregate endpoint and its terms before adding it, rather than averaging country percentages.
