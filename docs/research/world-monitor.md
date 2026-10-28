# World Monitor: Teardown Notes

Research from 2026-10-28 on [World Monitor](https://www.worldmonitor.app/) ([repo](https://github.com/koala73/worldmonitor), AGPL-3.0), the closest existing product to this project. It's a reference for data and patterns, not a template. Do not copy its code or curated data files; go to the original sources.

## Summary

World Monitor's Energy view is a strong starting inventory, but it blurs capacity, status and actual flow. Showing the gap between what infrastructure could carry and what it actually carries is where this terminal can be distinct.

## Capacity, status, flow

| Dimension | Meaning | Example signal |
| --- | --- | --- |
| Capacity | What infrastructure could carry or hold | A pipeline rated at 55 bcm/yr |
| Status | Operating, idle, damaged, sanctioned, planned, cancelled | Nord Stream damaged in 2022 |
| Actual flow | What is really moving or stored now | A line running at a fraction of capacity; a reserve drawing down |

## Layers worth borrowing

- **Sanctions** and **armed conflict events** (Uppsala Conflict Data Program) for a political overlay
- **Displacement flows** as human movement alongside energy movement
- **Trade routes through chokepoints**
- **Industrial activity** from Sentinel-5P NO2: satellite pollution readings as a ground-truth proxy for real output
- **Day/night terminator** as a local-texture cue
- **Time filter scoped to fast layers only**, matching slow-to-fast layering

## Data quality issues found in their pipeline data

- **Most "Disputed" badges come from stale evidence, not real disputes.** Each badge is derived from an evidence bundle, and any offline or reduced claim is demoted to "Disputed" once its evidence is older than 14 days. Their curated evidence was last updated in April 2026, so Nord Stream, with an operator statement and EU sanctions on file, shows "Disputed". With fresh evidence, the gas list would show 9 offline, 10 reduced and 28 truly unknown instead of 47 disputed. (Verified by re-running their rule in `src/shared/pipeline-evidence.ts` against `scripts/data/pipelines-{gas,oil}.json`.)
- **Decay is asymmetric.** "Flowing" claims never go stale, by design. Old data therefore drifts toward looking normal.
- **Duplicates slip past the dedup.** Their deduper matches GEM imports to curated rows by endpoint distance and name similarity, but misses differently named pairs. Curated "Urengoy–Pomary–Uzhhorod (Progress)" is offline; the GEM row "Progress Gas Pipeline" for the same route is flowing.
- **GEM "Operating" becomes "Flowing".** About 75% of rows take their state from GEM's infrastructure status, which says whether an asset is built and in service, not whether anything moves through it. That explains Russia-to-Ukraine lines marked Flowing after transit ended in January 2025.
- **Storage shows capacity only**, with the same badge issues.

## Codebase at a glance

| Part | What they use |
| --- | --- |
| Front end | TypeScript single-page app, no framework; about 950 source files and 630,000 lines of TypeScript overall |
| Maps | deck.gl on MapLibre for the flat map; globe.gl for the 3D globe |
| Data pipeline | Scheduled seed scripts fetch sources, write to a Redis cache, and record freshness; the browser reads cached data only |
| Hosting | Vercel, Railway, Upstash Redis; Tauri desktop app |
| License | AGPL-3.0 |

Far too large to fork for a personal tool. Much of the size comes from serving many audiences, a paid tier and several hosting platforms.

## Patterns worth borrowing

- **Seed, cache, read.** Jobs gather data on a schedule; the page never calls sources directly.
- **Freshness as data.** Every dataset stores when it was fetched, and a health check flags anything stale.
- **Evidence bundles.** Each pipeline carries raw evidence and a versioned rule turns it into a badge. Their principle, "we ship the evidence, not our opinion", fits this project. Show the evidence itself, with its date.
- **Flow against baseline.** Chokepoint transits from IMF PortWatch compared with EIA baseline volumes.
- **Disruption event log.** Outages recorded as dated state changes (sabotage, sanction, maintenance).
- **Curated registries as plain JSON** in the repo, reviewable in diffs.
- **Provenance on every import.** GEM data is imported by hand each quarter, recording release date and file fingerprint.
- **Dedup by name and place together**, with hand-checked records winning conflicts.
- **Rules applied the same way everywhere.** The badge rule is versioned and runs identically on server and client.
- **Refresh only what's in view.** Pause when hidden, back off when a source struggles.

## Energy sources they wire up

| Source | Gives | Cadence |
| --- | --- | --- |
| Global Energy Monitor | Pipeline and asset inventory | Manual quarterly import (CC-BY 4.0, registration required) |
| GIE AGSI+ | EU gas storage fill levels | Daily |
| IMF PortWatch | Chokepoint and port transits from ship tracking | Every 6 hours |
| EIA | Petroleum data, chokepoint baselines, short-term outlook | Daily to monthly |
| JODI | Country oil and gas production, trade, stocks | Monthly |
| IEA | Oil stocks, crisis policies | Monthly |
| UN Comtrade | Trade flows between countries | Monthly |
| Our World in Data | Country energy mix | Monthly |
| USGS and BGS | Mineral production and processing shares | Yearly |
| UCDP, ACLED, GDACS | Conflict events and natural hazards | Daily |

## How they place news on the map

Google News RSS search queries (for example, Reuters energy stories via `site:reuters.com` searches) plus a keyword gazetteer that maps story text to about 100 fixed "hubs" (capitals, strategic places). Coarse: a story about a pipeline lands on a capital, not the pipe.
