# Research to do

Items that couldn't be sourced or that need a decision. See CLAUDE.md: unsourced values stay `unknown` until resolved here.

## Chokepoints

- ~~EIA reference volumes differed from SPEC section 7.~~ Resolved 2026-10-28: using EIA's 2024 column (latest full year), SPEC updated. Note that 2024 Suez (4.8) and Bab el-Mandeb (4.1) reflect Red Sea rerouting, about half their 2023 levels.
- **Danish Straits:** PortWatch's `chokepoint10` is the Oresund only. EIA's Danish Straits figure includes the Great Belt, where most large tankers pass. Check whether PortWatch publishes a Great Belt series; if not, the M3 flow index for this chokepoint tracks Oresund traffic only and the panel says so.
- **Turkish Straits:** PortWatch's `chokepoint3` is the Bosporus; EIA reports the Turkish Straits at the Dardanelles. Probably the same tanker traffic, but confirm.
- **Port calls coverage:** PortWatch's `Daily_Ports_Data` had no rows at all (checked 2026-10-29) for Yanbu (`port570`), Sidi Kerir (`port2129`), Novorossiysk (`port833`), Primorsk (`port1020`), Ras Laffan (`port1090`), Ras Tanura (`port1091`), Juaymah (`port526`), Das Island (`port2237`) or El Sokhna (`port828`), though its ports database lists them all. Ust-Luga (`port1095`) stopped on 2026-07-26. Al Basrah (`port20`), Basrah Oil Terminal (`port2479`) and Mina al-Ahmadi (`port743`) report near zero tanker calls, which looks like a coverage gap, not a stop. Kharg Island (`port2164`) queries failed; retry. Only Fujairah and Ceyhan (`port162`, named "Botas") are wired up. Ask PortWatch whether coverage is planned, or find another source.

## Oil terminals

- **CPC Marine Terminal location:** the map uses the end of GEM's CPC route, about 30 km inland of the terminal at Yuzhnaya Ozereyevka; PortWatch has no entry for it. Find a citable coordinate (CPC, a port authority, or a nautical source).
- **No dated status source (checked 2026-10-29):** Ras al-Ju'aymah, Mina al-Ahmadi and LOOP show unknown. Kuwait's exports were 39% below pre-war in the first 22 days of October (Arab Times, citing TankerTrackers), but the report doesn't name Mina al-Ahmadi. LOOP's latest coverage is the March 2026 spill.
- **Capacities:** none cited yet. EIA's country briefs that list terminal capacities render with JavaScript or are old summaries; Ras Tanura (5.4 mb/d in 2025, Al Jazeera) and Sheskharis (0.65 mb/d, January to July 2026, The Moscow Times) show cited average loadings instead.
- **Claims refresh:** since 2026-10-29 the weekly job also searches for a first claim for assets with none (the three above). Anything it finds goes to the review pull request; if a run finds nothing, they stay unknown.

## Basins

- ~~Countries each basin spans.~~ Done 2026-10-28 with Natural Earth 5.1.1 1:50m admin-0 (public domain), used at import only. Rule in `BASIN_COUNTRY_OVERLAP`: at least 1,000 km² of land overlap, or at least 20% of the country.
- **Offshore basins have no countries.** Twelve since the import went worldwide: South and North Barents, Vestford-Helgeland, North Sea Graben, Provence, Saigon, Malay, Penyu/West Natuna, Gulf Cenozoic OCS, Labrador-Newfoundland Shelf, Malvinas and Tobago Trough overlap no land (by the overlap rule), so the panel says so. Naming the coastal states would need maritime boundaries (for example Marine Regions EEZs, CC BY); decide if it matters.
- **Flow data outside the theater.** Pipelines in the Americas and Asia show GEM's dataset status only. Candidate measured sources to check (terms, format, frequency): Canada Energy Regulator pipeline throughput and capacity (open data); for the US, EIA publishes pipeline capacity but no daily metered flows that we know of.
- USGS provinces date from the 2000 World Petroleum Assessment. Fine as a backdrop; note the age in the basin detail if it matters.
- **Basin volumes are from 2000** (added 2026-10-31). Produced and remaining come from a 1996 industry database, undiscovered from the 2000 assessment; the basin detail says so. 25 of the 134 mapped provinces have none, every US one among them (list in `data/reports/import-basins.json`). Newer figures to look at: USGS National Oil and Gas Assessments for US provinces (by assessment unit, years vary; shale since 2000 changes the Permian entirely) and the USGS world assessments after 2000 (2012 onward, undiscovered only, by assessment unit). Either needs a mapping from assessment units to these provinces.

## Pipelines

- **Owner and parent home pages cover about half the companies** (added 2026-11-01). 2,731 of 5,072 parent entries on published pipelines link. The tracker has no home page for several state companies (GAZ-SYSTEM, PipeChina's branches, QazaqGaz, Gas TSO of Ukraine), and GEM lists 905 parents as "unknown". Names two companies share stay unlinked without the row's ID (Gazprom on some rows). A home page shows a company exists, not that it owns the line; GEM's page for the line is the corroboration. Stronger: cited ownership claims per corridor pipeline (filings, annual reports), checked in code like `refresh:claims`. LNG terminal owners aren't linked yet; check whether GEM's LNG file carries entity IDs.
- **GEM rows without a route can't be drawn.** 530 gas rows and 332 oil rows worldwide have no geometry and no endpoint coordinates, so the SPEC's great-circle fallback has nothing to connect. Some are in the theater (for example Druzhba's Freundschaft 1 and 2 segments). Endpoints would need geocoding from `StartLocation` / `EndLocation`; decide in M4 alongside the curated list.
- ~~`geometryApprox` covers GEM's low-accuracy routes.~~ Confirmed 2026-10-28; SPEC 5 updated.
- **GEM status is a dataset claim with old dates.** It goes in as `sourceType: 'dataset'` dated by GEM's `LastUpdated`. Since M4, cited claims outrank it whatever the dates (SPEC 6); GEM's claim stays in the status history.
- **GEM statuses with no match in ours:** `shelved` and `mixed status` map to `unknown`, `mothballed` to `idle`, `retired` to `offline`. Cancelled and shelved rows are not imported.
- **Pipeline history and ownership come from GEM as published.** Start years (3,247 of 4,667 lines), length (known or estimated from the route), diameter, end points and parent companies. Proposal and construction years exist only in the oil tracker. Some GEM ownership lists cover less than 100% (BTC's parents: 89.2%); the page says so. Notable errors are fixed by citing the operator's own list in `data/curated/pipelines-evidence.json`.
- **GEM traces CPC's 7% "CPC Co" stake to CPC Corporation, Taiwan.** CPC's own shareholder page lists the holder as IC CPC Company LLC without naming a parent. CPC now uses CPC's list (read 2026-10-28) and shows no parents. Other GEM parent chains haven't been checked.
- One gas row (`gem-p5854`) lists its country as "Kuwait-Saudi Arabia" (the former neutral zone); it's kept with that country left out.

## LNG terminals

- **Ras Laffan curated 2026-10-29** (North and South sites): reduced, from Semafor (Bloomberg) 2026-10-20 and Reuters (Kpler) 2026-10-12, with the March shutdown and the strike on South Trains 4 and 6 in the history and a disruption record each. Still open:
  - Reports on 2026-10-28 that QatarEnergy extended force majeure to the end of 2026 came only through aggregators (OilPrice via ua.news); find the primary before adding it.
  - GEM groups the South site's trains as S(1) T1-2, S(2) T3-5, S(3) T6-7, so Trains 4 and 6 can't be marked on their own units; the units table stays GEM's, with a note.
  - The National (2026-04-09) gives 12.8 mtpa lost and the South site cut from 36 to 24 mtpa; GEM lists the South site at 36.3 mtpa.
- **EU import terminals have measured send-out (2026-10-29).** 30 GEM terminals link to GIE ALSI facilities (`ALSI.terminals`), matched by ALSI's coordinates and GEM's aliases (Wilhelmshaven 1 and 2, Ravenna's Snam FSRU rather than the small-scale depot, Klaipėda's FSRU, Rovigo as Adriatic LNG). Hamina and Stade are mapped but ALSI reports no data for them. Not covered: the UK (ALSI's UK series ended in 2021 and 2022; National Gas would be the source), Lubmin and Le Havre (closed in ALSI), and Spain's virtual tank (TVB), which isn't a terminal. Send-out is regasified gas into the grid, not cargo arrivals.
- East London LNG Terminal (proposed) has no country in GEM's file; it's imported with the country left empty.
- 48 live units have no capacity in GEM's mtpa column. A terminal whose units all lack it shows capacity "Unknown"; one with some known shows only the known part.
- GEM sometimes places units of one project apart; the terminal sits at its first unit with the terminal's status.
- **Das Island (2026-10-29).** `operating` on Bloomberg's satellite report of loadings on 2 September (via Energy Connects), so it shows as unverified. ADNOC Gas's March statement only says it "adjusted" LNG production and gives no Das-specific volume; its 53% fall in second-quarter exports and liquids sales covers the whole company, not Das alone. Nothing fetchable on October loadings.

## Disruptions and reporting

- Two sourced records so far (`data/curated/disruptions.json`): Hormuz, cited to CRS R45281 (2026-08-07), the Commons Library briefing CBP-10636 (2026-06-08) and News On AIR (2026-04-10); Bab el-Mandeb, cited to CNBC (2026-07-22) and Al Jazeera (2026-08-12). Both need later sources as events move: for example the IRGC closure declaration of 2026-10-26 and the IMO mine warning of 2026-10-27, which showed up only in secondary aggregators. Find primary or wire reports before adding them.
- The International Crisis Group website returns 403 to automated requests. Its RSS feed (`https://www.crisisgroup.org/rss.xml`) works, but carries only the 10 latest items, with titles and links and no article text. The Commons Library briefing CBP-10636, CNBC and congress.gov (CRS R45281) also blocked automated reads; the user saved them as PDFs in `docs/research/`. Blocked sources can be read that way, but the cited URL stays the publisher's.
- The Red Sea attacks of 2023 to 2025, which explain Bab el-Mandeb and Suez running at about half their 2023 levels in 2024, have no disruption record yet.

## Curated corridor pipelines (M4)

Thirty-two corridor pipelines are curated in `data/curated/pipelines-evidence.json`. Twenty-three have cited status claims: Nord Stream 1 and 2, Brotherhood, Progress, TurkStream, Druzhba south, Kirkuk–Ceyhan, East–West, Habshan–Fujairah, SUMED and Arish–Ashkelon (added 2026-10-28), CPC and BTC, Druzhba north, BPS-1, BPS-2, Soyuz and Blue Stream, South Caucasus, TANAP and Maghreb–Europe, and two Arab Gas Pipeline sections (added 2026-10-29). Nine are curated so ENTSOG flows can attach, with status left to measured flow and GEM: Yamal–Europe, TAP, Transmed, Greenstream, Medgaz, Langeled, Franpipe, Zeepipe and Baltic Pipe (Faxe, entry into Poland).

- **Still to research and cite** (SPEC 7 list): Europipe I and II. Leads found but not used:
  - Habshan–Fujairah: attacks on Habshan and Fujairah in March to May 2026, in paywalled MEED and secondary sources.
  - Yamal–Europe: Russia banned Gazprom from the Polish section in May 2022 (Bloomberg, paywalled). ENTSOG shows zero flow at Mallnow in both directions.
  - Maghreb–Europe: Algerian flows stopped November 2021; reverse flows to Morocco since 2022. Needs a primary source.
- **Gulf and Red Sea bypasses (2026-10-28).** CNBC, Ahram Online, EnergyNow, Israel Hayom and MEES blocked automated reads. If they're saved as PDFs in `docs/research/`, these can be firmed up:
  - Habshan–Fujairah: the latest claim is from 15 May 2026, so it shows as unverified. Fujairah loadings were disrupted by drone attacks around 14 and 15 March 2026 and resumed (EnergyNow, blocked); that's a port disruption, which the disruption model can't attach to a pipeline yet. Capacity is cited as 1.8 mb/d from Reuters (2026-08-28, saved as a PDF in `docs/research/`), which matches GEM. Al Jazeera (2026-05-15) gives 1.5 mb/d, and other reports call 1.5 the design rate and 1.8 the maximum.
  - SUMED: Sidi Kerir loadings of about 2.1 to 2.2 mb/d in August 2026 (Kpler via Ahram Online and CNBC, both blocked) would be a better claim than the LSEG remark now used. Kpler's own factbox has no date on the page. Loadings are tracked cargoes, not metered pipeline flow.
  - Arish–Ashkelon: The National (2026-04-07) reports Israeli pipeline supplies to Egypt and Jordan curtailed for several weeks under force majeure during the Iran war, then back near pre-war levels from 3 April. It doesn't name the pipeline, so it isn't attached; find a source that names EMG to record the outage.
- **Europipe I and II: no meter and no dated source.** ENTSOG's Norwegian-side point "Dornum (EPT1 & EPT2)" combines both lines, and Europipe I is metered again at Emden (EPT1) after a 48 km land line from Dornum (Gassco), so neither line can be given its own flow. No dated 2026 report names either. Gassco's urgent market messages would be the source.
- **Arab Gas Pipeline, by section (2026-10-29).** Curated records cover single sections and name the system, so each keeps its own status.
  - Egypt–Jordan (Arish–Taba–Aqaba): `operating` on Enterprise's report (2026-07-15) that Egypt can draw up to 450 mmcf/d from Aqaba's shared FSRU through the pipeline. That's the arrangement, not a measured flow, and the claim shows as unverified.
  - Jordan–Syria (Jaber–Homs): `operating`, latest claim Petra on 2026-05-04 (Jordan regasifies imported gas and supplies Syria through the pipeline), so it still shows as unverified. A search tool dated the Jordan Times report on Qatari gas to Syria as late October 2026; the saved PDF (`docs/research/`) shows it is from 2 July 2025, older than the Petra claim, so it isn't used. A dated report from after May 2026 is still needed.
  - Homs–Deir Ammar (Syria–Lebanon) keeps GEM's `mothballed`. L'Orient-Le Jour reports TGS repaired a leak but further tests are needed before it runs, and that Syria supplies Lebanon by another line from Homs meanwhile; the page blocked automated reads. AGBI (May 2026, Egypt's TGS to repair Lebanon's network) also blocked. Saved as PDFs in `docs/research/`, these would let the section be curated.
  - The Jordanian sections (Aqaba–Rihab, Rihab–Jaber) keep GEM's `operating`.
- **Southern Gas Corridor and Maghreb–Europe (2026-10-29).**
  - SCP's capacity is SGC's 24.04 bcm/yr from an undated project page (read 2026-10-29); GEM's two rows give 7.41 and 16.63. BP describes it as 7 plus 16.
  - TANAP's latest claim is the Energy Ministry's January to September 2026 figure via Interfax (4.2 bcm through TANAP, down 2.3%). The ministry reports TANAP's volume within its exports to Türkiye. ENTSOG's Kipoi point meters only the part TANAP hands to TAP, so it isn't attached.
  - Maghreb–Europe is `reduced`: it runs in reverse from Spain to Morocco at about 20 to 31 GWh/d against 12 bcm/yr of capacity. Our status values have no word for reversed flow. ENTSOG reports only the exit at Tarifa (Spain to Morocco), so it isn't attached as measured flow.
- **Russia to Europe (2026-10-29).**
  - Druzhba north is curated as the Belarus-to-Poland trunk only (Mozyr–Brest and Adamowo–Płock). West of Płock the Polish and German sections also carry seaborne crude from Gdańsk to Schwedt, so they keep GEM's status. Its `idle` status rests on the Kazakh transit halt (no Russian crude to Poland since February 2023); a source saying the trunk carries nothing at all would be firmer.
  - The claims for BPS-1 and BPS-2 are about the ports they end at (Primorsk, Ust-Luga): loadings, not pipeline throughput. That each line ends at that port is general knowledge, not in the sources. BPS-2's latest claim is CREA's September figure (Ust-Luga crude loadings down 26% month on month after early-September strikes). Status stays `operating`: CREA reports a drop, not a share of capacity.
  - Soyuz's only claim is from May 2022. The Russia-to-Kazakhstan section may still carry gas; the claim covers the flow into Ukraine. GEM also lists it as idle.
  - Blue Stream's claim is TASS on the 7 July compressor attack; TASS gives Turkey's imports only for TurkStream and Blue Stream together (948 mcm in July). Energy Intelligence reports Gazprom's operating stake was arrested (paywalled).
- **CPC and BTC (2026-10-29).** CPC's latest claim is Reuters' September throughput (1.59 million b/d, via Baird Maritime, 2026-10-13); nothing fetchable on October loadings yet. Reuters reported Kazakhstan shipping more through BTC in October (168,000 tons, up from 130,000 in September) via a newsletter only. BTC's latest claim is Trend's January to September total, whose article is paywalled past the headline.
- **East–West, September 2026.** Al Jazeera (2026-09-17) reported the drone attacks halted flow, with repairs expected to take three to five weeks (AP). The minister later said it was back in use within five or six days (Al Jazeera, 2026-10-06). The disruption record follows the later statement; the conflict is unresolved.
- **Progress and Brotherhood both cite the GTSOU statement about Sudzha.** The statement names the Sudzha entry point, not the pipelines. Both lines entering at Sudzha is general knowledge rather than something the source says; find a source that names them.
- **Druzhba south after April 2026.** CREA's September 2026 analysis says all EU crude imports from Russia that month came through Druzhba to Slovakia and Hungary, which is now the latest claim. It is a monthly value total, not a flow rate.
- **Claims refresh (2026-10-29).** New claims for TurkStream, Druzhba south, Habshan–Fujairah, TANAP, BPS-2, SUMED, Kirkuk–Ceyhan, CPC, Druzhba north and Arab Gas Jordan–Syria. Claims dated to the end of a month describe that month's data (for example September throughput reported in October). Still unverified, with nothing newer found:
  - Blue Stream (July 2026): no 2026 volumes for Blue Stream alone; Gazprom and Turkish sources give TurkStream and Blue Stream together.
  - Arish–Ashkelon and Arab Gas Egypt–Jordan (July 2026): no dated report on Leviathan flows to Egypt or Jordan after the July infrastructure news.
  - Maghreb–Europe (August 2026): Enagás publishes daily readings at Tarifa; a fetchable page with them would keep this current.
  - Druzhba north (August 2026): Kazakhstan's minister said Transneft's three-month plans show zero transit, which runs to about late November.
  - Das Island LNG (September 2026): nothing after Bloomberg's 4 September satellite report of loadings continuing.
  - Brotherhood, Progress and Soyuz carry old `offline` claims; they describe lasting stops, so they show as unverified but are unlikely to change.
  - Kirkuk–Ceyhan's new claim (Washington Kurdish Institute, about 450,000 b/d toward Ceyhan by 4 October) says "the northern system" without naming the federal line or the Kurdistan pipeline.
- **Kirkuk–Ceyhan and East–West carry flow figures in their claims** (about 450,000 b/d toward Ceyhan against 1.4 mb/d of GEM capacity; 5.8 of 7 mb/d). Status stays `operating` because no source calls them reduced.

## ENTSOG

- Points were checked against `operatorpointdirections` on 2026-10-28. No data at Greifswald (Nord Stream), at Dornum and Emden from the Gassco side (Europipe I and II), or at the DESFA Kipi entry (TANAP into Greece). Europipe may report on the German TSO side under another key; worth a second look.
- TurkStream is measured at Strandzha 2, the European line only. Deliveries to Turkey aren't on ENTSOG.
- Easington, Dunkerque and Zeebrugge ZPT are the landing points of Langeled, Franpipe and Zeepipe. Each point may also carry other lines; Easington, for example, has other North Sea landings. Treat the measured flow as the point's flow.

## AGSI+

- Country list and slugs checked on 2026-10-28 against the provider listing from agsi.gie.eu. Serbia isn't covered. Ireland's only site (Kinsale Southwest) is decommissioned. The UK's current data is under `GB*`; `GB` is the pre-Brexit series and is empty now.

## M5

- An EU-wide storage fill for the summary. AGSI+ publishes EU aggregates, but the job only fetches countries; check the aggregate endpoint and its terms before adding it, rather than averaging country percentages.

## M6: where is my oil from?

- PADD hubs (the arcs' end points) use EIA's 2021 refinery shapefile; the Energy Atlas FeatureServer with current locations needs a token. Capacity and counts come from `pnp/cap1` (1 January 2026), so only the hub points are old.
- Curated routes (`data/curated/oil-routes.json`) cover Saudi Arabia, Iraq, Colombia, Guyana, Brazil, Nigeria and Ecuador. Countries without one show no chokepoints. Next by share: Libya (7% of the East Coast), Mexico, Argentina, Angola, Ghana and Gabon.
- None of the Atlantic and Pacific routes added on 2026-10-29 passes a chokepoint on our list, so their `exitVia` is empty. That is destination-dependent for the Caribbean: Colombian or Guyanese crude bound for the US West Coast may cross Panama (by the canal or the Trans-Panama pipeline). `exitVia` is per terminal, so this would need per-destination chokepoints and a source.
- Nigeria: Forcados and Qua Iboe, two of the four largest streams, aren't named in PortWatch's ports database. It lists 18 unnamed "Nigeria - Offshore Oil Terminal" entries; one near Forcados (fso140, 11.8% of seaborne exports) is likely it, but that needs a source before it's mapped.
- Bonny, Açu, the Stabroek FPSOs and Balao use nearby PortWatch points (`pointApprox`). Brazil's other 52% loads elsewhere, unmapped.
- Ecuador's route source is from 2022; a current one would be better.
- Saudi Arabia's route lists Ras Tanura, Ras al-Ju'aymah and Yanbu as alternatives; the split between Gulf and Red Sea loadings for US cargoes isn't in the EIA source, which is why Hormuz shows as "up to".
- Iraq's route lists Basrah and Ceyhan; cargoes to the US West Coast are almost certainly Basrah crude, but no source says so per cargo.
- EIA names PADD 5 offshore production "Federal Offshore PADD 5"; it shows that way.
- Canadian crude could be drawn along the GEM cross-border pipelines into each PADD instead of a straight arc.
- Over the 12 months, West Coast refineries ran more crude (1.98 million b/d) than flowed in (1.93). Stock draws would explain it, but that isn't checked; the panel's caption says "stocks and other inputs" rather than implying a surplus.

## M7: where is my fuel from?

- Fuel imports have no cited routes, so refined fuels show no chokepoints. Imports into the West Coast (jet fuel from Korea and others) are the likeliest to pass one; that would need routes for the exporting refineries' ports.
- The gasoline remainder ("made in the region or drawn from stocks") also absorbs ethanol stock changes and any blending of other components (butane, for example). It is small on the East Coast (7%) and large where refineries are local.
- Renewable diesel and biodiesel move separately (`EPOORD`); they aren't in distillate, so they're left out of "diesel and heating oil". Worth a row on the West Coast, where renewable diesel is a real share.

## News scan (M9)

- **Feed terms.** Google News RSS says its feeds are "solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use" (read 2026-10-31). This is a personal tool, which fits; revisit before opening the site to others. GDELT's DOC API asks for one request every 5 seconds and suggests its ngrams dataset for heavy use; at 16 queries twice a day we are well inside that, but check its terms for attribution.
- **Google News links.** Resolving a Google News redirect to the article needs an undocumented Google endpoint, so the scan doesn't. If GDELT coverage proves thin for a publisher, look for that publisher's own RSS feed.

## M10: beyond the EU and the US

Checked 2026-11-01 against the sources' own pages, except where it says otherwise. Not legal advice: where a licence is unclear, the step is to ask the publisher in writing.

**Gas storage**

- **EIA weekly storage: built.** API v2 route `natural-gas/stor/wkly` confirmed 2026-11-01, faceted by `series` (`NW2_EPG0_SWO_R48_BCF` for the Lower 48, `R31` to `R35` for the regions; salt and nonsalt `SSO`/`SNO_R33` not used). Weekly from 2010, values as strings, in BCF. `https://ir.eia.gov/ngs/wngsr.json` also carries EIA's own 5-year average, not used yet. Public domain.
- **JODI Gas: built, permission asked.** The CSV link is drawn by a script: the file list is at `https://api.publisher.jodidata.org/web/files/gas` and the file at `https://www.jodidata.org/jodi-publisher/gas/<publicationId>/GAS_world_NewFormat.zip` (publication 28 on 2026-11-01, data to 2026-08, one month further for Malta). 65 countries have ever reported closing stocks (`CLOSTLV`, million m³); with assessment codes 1 or 2 and data within 200 days, 34 do, among them Japan (6.5 bcm, likely LNG in tanks), South Korea, Türkiye, Azerbaijan, Chile, New Zealand and Norway (code 2). Left out: Russia (code 3, 50 million m³, far from its known storage), Brunei, Hong Kong, Indonesia, the Philippines, Taiwan and Thailand (code 3); India (latest 2024-09) and South Africa (2024-12) as stale; Bahrain, Switzerland, Estonia, Ireland, Luxembourg, Morocco, Slovenia and Tunisia report zero. Canada's 2026-08 value equals Statistics Canada's 2026-07, so JODI may lag a month there. Terms reserve all rights; jodiinfo@ief.org asked 2026-11-01. Not checked yet: whether closing stocks include cushion gas (Germany's 11.8 bcm in 2026-08 is in range of working gas).
- **Canada: built.** Table 25-10-0057-01 is inactive, ending 2025-12; its successor is 25-10-0086-01, "Natural gas supply and disposition, monthly", from 2016-01 to 2026-08 (released 2026-10-23, so about eight weeks behind). Closing inventory is item 2, cubic metres unit 1, in thousands. Provinces with storage: Quebec, Ontario, Saskatchewan, Alberta, British Columbia. Open Licence: a value-added product carries "Adapted from Statistics Canada, name of product, reference date. This does not constitute an endorsement by Statistics Canada of this product." Weekly Canadian figures (the Enerdata survey) are commercial.
- **Japan, METI weekly LNG inventories at major power utilities: not verified.** The weekly release exists (reported weekly by Argus and S&P Global since January 2021), but METI's and ANRE's sites refused automated fetches. Check by hand: the page, the format, how far back it goes, and the government standard terms of use (政府標準利用規約).
- **China: no regular series found.** The best figure is annual: the International Gas Union's 2025 storage report put China's working gas volume at 19.8 bcm, out of 424 bcm worldwide. Company and state-media figures appear now and then, with mixed definitions.
- **Russia, Iran: not found yet.** No regular public storage series turned up. Check Gazprom's own disclosures before naming Russia as not covered.

- **USGS basins: one province twice.** `usgs-6107` (Lesser Antilles Deformed Belt) is two polygons in WEP_PRVG, so `basins.json` has it twice and the Basins list shows it twice. `import:basins` should dissolve by `CODE`.

**Oil origins**

- **Eurostat `nrg_ti_oilm`: ready.** Monthly imports by partner country, with crude on its own (`siec=O4100_TOT`), in thousand tonnes, from 2008-01. As of 2026-11-01 the latest month is 2026-09 (updated 2026-10-30), though single countries can lag a month more (Germany's 2026-09 was empty). Reporters: the EU 27, plus Norway, the UK, Türkiye, Serbia, Montenegro, North Macedonia, Albania, Moldova and Georgia. 174 partners, including a total. API: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ti_oilm`. Licence: Eurostat's copyright notice puts its content under CC BY 4.0. Changes have to be stated, and data Eurostat marks as from other sources is non-commercial only. Read the live notice before building.
- **Eurostat `nrg_ti_coifpm`:** crude imports by field of production (the producing country is the prefix of each crude code, such as `NO_EFK`). Latest month 2026-09. Useful for "Urals versus ESPO", not needed for shares by country.
- **UN Comtrade: settled 2026-11-02.** Comtrade replied by pointing to its updated re-dissemination page, which allows free, non-commercial use, derived metrics such as market shares, and free extractions of up to 100,000 original records, credited "Source: UN Comtrade." We publish 337 partner rows. Stay free and non-commercial, stay under the limit, and write to comtrade@un.org before either changes. The license agreement page renders only in a browser and wasn't read; check its caching terms by hand. Earlier notes: The free tier needs a free key: 500 calls a day, up to 100,000 records a call. The data-use policy says data is for internal use and not to be re-disseminated without permission, but its re-dissemination page exempts transformed data, naming "market shares" and other derived metrics. Publishing limited amounts in a few tables or graphs, and free public dashboards, are also allowed. Shares of a country's crude imports by partner fit that, cited as "UN Comtrade". The 2012 licence agreement has no such carve-out, so email comtrade@un.org to confirm this use before launch. Don't publish raw record dumps (100,000 records or more needs a licence), and don't scrape the web interface.
- **National crude import statistics: not checked yet.** Japan (METI), South Korea (KNOC Petronet), Canada (Canada Energy Regulator or Statistics Canada), the UK (DESNZ Energy Trends), China (customs), India (PPAC). For each: origins by country, freshness, terms. Only needed where Comtrade lags too far.
- **The 30 largest crude importers: built from the data** (Comtrade's value for 2025, 2026-11-01). With Eurostat and EIA, 41 countries are listed, none of the 30 left out. What the first fetch showed, worth knowing before reading the shares:
  - Taiwan reports to Comtrade as "Other Asia, nes" (reporter 490) with no ISO code, so it isn't listed. It's a large importer; its own customs or energy statistics would be the source.
  - Israel and Bulgaria give all their crude imports as "not specified" (Comtrade's "Areas, nes" for Israel, Eurostat's not-specified partner for Bulgaria), so their pages show one unnamed row.
  - Thailand's 2025 Comtrade rows lack weights for too much of the value, so its shares are by value.
  - Finland reported 8 of the last 12 months to Eurostat; the page says so.
  - The UK isn't in Eurostat after leaving the EU; it comes from Comtrade (2025, annual). DESNZ Energy Trends would be monthly.
  - Türkiye is in Eurostat but has no Comtrade value for ranking, so it sits with the unranked countries at the end of the list.
  - China's partners include Malaysia at 11%, mostly crude shipped on from elsewhere; partners are named as each source records them.
  - Comtrade runs on the public preview until `COMTRADE_API_KEY` is set (free at comtradedeveloper.un.org).

## News freshness (raised 2026-11-03)

Home's cards only change when a disruption gets a new source, and the scan only drafts from headlines that name a mapped asset. On 2026-11-03 the scan moved to every 3 hours and Hormuz and Bab el-Mandeb gained nearby place names (`NEWS.extraTerms`). Still to do, in order:

- **"In the news" on Home.** The latest headlines the scan matched to the map, each with its publisher, age and link, labelled "Headlines, not reviewed". No Claude call, so nearly free, and it changes every run. Check the feed's terms first: Google News RSS is for personal, non-commercial use; GDELT is the clearly open one for showing headlines.
- **Optional: publish new disruptions without review** when two trusted publishers report them, marked `unreviewed` like the scan's sources. Today new disruptions and end dates wait in a pull request, so an event like the Qeshm strike (Reuters, 2026-11-03) never reaches Home on its own.
- **More nearby places** for other assets as misses show up (Kharg Island, Basra, the Red Sea ports). Keep the list short; ambiguous names go in `NEWS.weakTerms`.
- **GDELT answers 429 from GitHub's runners** on most queries (2026-11-02: 13 of 13, then 9 of 13), so stories are found by search instead, at a little more cost. Worth a slower pace or a cache.
