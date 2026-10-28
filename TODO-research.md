# Research to do

Items that couldn't be sourced or that need a decision. See CLAUDE.md: unsourced values stay `unknown` until resolved here.

## Chokepoints

- ~~EIA reference volumes differed from SPEC section 7.~~ Resolved 2026-10-28: using EIA's 2024 column (latest full year), SPEC updated. Note that 2024 Suez (4.8) and Bab el-Mandeb (4.1) reflect Red Sea rerouting, about half their 2023 levels.
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
