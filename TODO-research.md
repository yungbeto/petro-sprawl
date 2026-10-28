# Research to do

Items that couldn't be sourced or that need a decision. See CLAUDE.md: unsourced values stay `unknown` until resolved here.

## Chokepoints

- **EIA reference volumes differ from SPEC section 7.** SPEC lists Hormuz 21.0, Malacca 17.2, Suez and SUMED 7.6, Bab el-Mandeb 6.2, Danish Straits 3.0, Turkish Straits 2.9, Panama 0.9 (mb/d, 2023). EIA's World Oil Transit Chokepoints page, Table 1, read 2026-10-28, gives 2023 values of 21.8, 24.0, 8.8, 9.3, 5.0, 3.5 and 2.2 (Panama by fiscal year). `src/lib/config.ts` uses the EIA page. Decide whether to keep 2023 or move to 2024 or 1H25, then update SPEC. Source: https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints
- **Danish Straits:** PortWatch's `chokepoint10` is the Oresund only. EIA's Danish Straits figure includes the Great Belt, where most large tankers pass. Check whether PortWatch publishes a Great Belt series; if not, the M3 flow index for this chokepoint tracks Oresund traffic only and the panel says so.
- **Turkish Straits:** PortWatch's `chokepoint3` is the Bosporus; EIA reports the Turkish Straits at the Dardanelles. Probably the same tanker traffic, but confirm.

## Basins

- **Countries each basin spans** (SPEC 4, basin detail) needs country polygons. Basemap tiles can't be queried reliably for this. Option: Natural Earth admin-0 (public domain), simplified once and committed. Needs a go-ahead since it's a new data source.
- USGS provinces date from the 2000 World Petroleum Assessment. Fine as a backdrop; note the age in the basin detail if it matters.

## Pipelines

- **GEM rows without a route can't be drawn.** 530 gas rows and 332 oil rows worldwide have no geometry and no endpoint coordinates, so the SPEC's great-circle fallback has nothing to connect. Some are in the theater (for example Druzhba's Freundschaft 1 and 2 segments). Endpoints would need geocoding from `StartLocation` / `EndLocation`; decide in M4 alongside the curated list.
- **`geometryApprox` covers GEM's low-accuracy routes**, not only endpoint-only lines as SPEC 5 describes, because GEM itself flags those routes as rough. Confirm that reading of the spec.
- **GEM status is a dataset claim with old dates.** It goes in as `sourceType: 'dataset'` dated by GEM's `LastUpdated` (TurkStream: 2023-08-11). Nord Stream 1 and 2 are `mothballed` in GEM, shown as idle; M4's curated evidence replaces that.
- **GEM statuses with no match in ours:** `shelved` and `mixed status` map to `unknown`, `mothballed` to `idle`, `retired` to `offline`. Cancelled and shelved rows are not imported.
- One gas row (`gem-p5854`) lists its country as "Kuwait-Saudi Arabia" (the former neutral zone); it's kept with that country left out.
