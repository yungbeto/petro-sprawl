# Working notes for Claude Code

The app is Petro Sprawl (renamed from Energy terminal on 2026-11-01). The repository, folder, Vercel project and production URL keep the old `energy-terminal` name.

Read `SPEC.md` fully before starting any work. `docs/product-brief.md` explains the why.

## How to work here

- Build milestone by milestone (SPEC section 11). Stop for review at the end of each milestone.
- Never fabricate statuses, capacities, flows or URLs. If something can't be sourced, use `unknown` and add it to `TODO-research.md`.
- Keep transforms pure and tested; keep thresholds and constants in `src/lib/config.ts`.
- Ask before adding dependencies beyond the stack in SPEC section 8.
- World Monitor is a reference only (AGPL-3.0). Don't copy its code or data files.
- Writing style for UI copy and docs: sentence case, no uppercase eyebrow labels, no em dashes.

## Commands

Node 22. Package manager: npm.

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npx playwright install chromium` | One-time browser download for the smoke test |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Typecheck (`tsc -b`) and production build to `dist/` |
| `npm run typecheck` | Typecheck only |
| `npm test` | Unit tests (Vitest, `tests/*.test.ts`) |
| `npx playwright test` | Smoke tests (`tests/e2e/`): `smoke.spec.ts` on a desktop window, `phone.spec.ts` on an iPhone-sized one (`--project desktop` or `--project phone` for either); starts its own dev server on port 5287 |
| `npm run fetch:portwatch` | Scheduled: PortWatch daily tanker transits and estimated tanker cargo (metric tons) to `public/data/chokepoint-transits.json`, and tanker port calls and estimated exports at the ports in `PORT_CALLS` to `public/data/port-calls.json` |
| `npm run fetch:entsog` | Scheduled: ENTSOG physical flows and technical capacity at the points in `ENTSOG.points` to `public/data/gas-flows.json` |
| `npm run fetch:agsi` | Scheduled: AGSI+ storage fill by country to `public/data/gas-storage.json`. Needs `AGSI_API_KEY` in `.env` (and as an Actions secret) |
| `npm run fetch:alsi` | Scheduled: GIE ALSI daily send-out for the EU import terminals in `ALSI.terminals` to `public/data/lng-sendout.json`. Same `AGSI_API_KEY`. Run `build:curated` after changing `ALSI.terminals` so terminals link to their series |
| `npm run fetch:eia` | Scheduled: EIA monthly crude imports by country, movements between PADDs, field production and refinery input to `public/data/oil-origins.json` (M6); gasoline, diesel and jet fuel used, received and imported by PADD, with ethanol, to `public/data/fuel-origins.json` (M7). Needs `EIA_API_KEY` in `.env` (and as an Actions secret) |
| `npm run fetch:all` | Every scheduled fetch, as the GitHub Actions workflow runs them |
| `npm run refresh:claims` | Weekly: Claude looks for newer sources for cited claims older than 30 days, and a first source for assets with no claim and no measured flow, and checks each draft against the page. First claims always go to review. Commits trusted confirmations to `data/curated/`; other drafts go to `data/reports/claim-drafts.json`; every outcome and the cost in `data/reports/refresh-claims.json`. Needs `ANTHROPIC_API_KEY` in `.env`. Run `build:curated` after it |
| `npm run apply:claim-drafts` | Adds the drafts in `data/reports/claim-drafts.json` to `data/curated/`, for the review pull request |
| `npm run scan:news` | Every 12 hours: GDELT and Google News headlines matched to mapped assets; Claude drafts a source, a new disruption or an end date from the articles, and code checks each against the page. Trusted sources on disruptions in effect go straight into `data/curated/disruptions.json` with `unreviewed: true`; the rest go to `data/reports/disruption-drafts.json`. Log and cost in `data/reports/scan-news.json`, seen headlines in `data/reports/news-state.json`. Needs `ANTHROPIC_API_KEY`. Run `build:curated` after it |
| `npm run apply:disruption-drafts` | Adds the drafts in `data/reports/disruption-drafts.json` to `data/curated/disruptions.json`, for the review pull request |
| `npm run build:curated` | Validates `data/curated/`; publishes disruptions, merges the curated corridor pipelines with GEM rows into `public/data/pipelines.json`, adds cited LNG evidence (`data/curated/lng-evidence.json`) to GEM terminals in `public/data/lng-terminals.json`, and publishes the curated oil terminals (`data/curated/oil-terminals.json`); merge log in `data/reports/dedup.json` |
| `npm run import:basins` | Manual: USGS provinces from `data/raw/usgs/` to `public/data/basins.json`, tagged with countries from Natural Earth in `data/raw/naturalearth/`; report in `data/reports/import-basins.json` |
| `npm run import:countries` | Manual: Natural Earth country outlines in the theater to `public/data/countries.json` (storage layer), and each country's World Bank region to `public/data/country-regions.json` (pipelines by region) |
| `npm run import:gem-companies` | Manual: company home pages from GEM's ownership tracker (`.xlsx` in `data/raw/gem/`) to `data/derived/gem-companies.json`, read by `import:gem`; report in `data/reports/import-gem-companies.json`. Python 3, standard library only |
| `npm run import:gem` | Manual: GEM gas and oil pipeline GeoJSON from `data/raw/gem/` to `data/derived/gem-pipelines.json`; skip counts in `data/reports/import-gem.json`. Run `build:curated` after it |
| `npm run import:lng` | Manual: GEM LNG terminals (one row per unit) from `data/raw/gem/` to `data/derived/gem-lng-terminals.json`, grouped into terminals; report in `data/reports/import-lng.json`. Run `build:curated` after it |
| `npm run import:us-lookup` | Manual: Census ZCTA relationship file and city populations from `data/raw/census/`, EIA refinery locations from `data/raw/eia/refineries/` and Natural Earth label points to `public/data/us-lookup.json` (ZIP to state, cities, PADD hubs, country points) |
| `npm run import:us-regions` | Manual: Census 1:20m state outlines from `data/raw/census/` merged into the five PADDs (`PADDS` in `src/lib/config.ts`) to `public/data/us-regions.json`, for the fuel origins map |
| `npm run import:chokepoints` | PortWatch locations plus EIA volumes (from `src/lib/config.ts`) to `public/data/chokepoints.json` |

Hosting is Vercel (`vercel.json`): a static Vite build of `dist/`, with Deployment Protection set to All Deployments (Vercel Authentication), so every URL, production included, needs a Vercel login. Production is https://energy-terminal-omega.vercel.app. With the GitHub repo connected, every push to main deploys, including the data commits. `vercel curl <url>` fetches through the protection; `.vercelignore` keeps raw data, saved articles and secrets out of CLI uploads.

Scheduled jobs run every 6 hours in `.github/workflows/data.yml` and commit `public/data` when it changes. The claims refresh runs weekly in `.github/workflows/claims.yml`: confirmations go to main, other drafts open a pull request (the repository must allow GitHub Actions to create pull requests). The news scan runs every 12 hours in `.github/workflows/news.yml` the same way; `NEWS_SCAN=off` as a repository variable turns it off. Every job writes through `publishDataset` in `jobs/lib/output.ts`: new data must pass its zod schema or the previous file stays and the failure is recorded in `meta/<id>.json`.

## Gotchas

- Playwright runs Chromium on the GPU on macOS (`playwright.config.ts`). Software WebGL draws the pipeline layer at about 1 fps, so camera animations never settle and URL tests time out. CI without a GPU needs another plan.
- The dev server exposes the map as `window.__etMap` so the smoke test can click real features. Dev only.
- Pipelines and LNG terminals are built in two steps: `import:gem` / `import:lng` (raw GEM to `data/derived/`), then `build:curated` (curated records win). Edit `data/curated/pipelines-evidence.json` or `data/curated/lng-evidence.json`, never the files in `public/data/`.
- Owner and parent links come from GEM's ownership tracker, matched by name: GEM's entity ID lists aren't in the same order as the names (a row pairs "Exxon Mobil Corp" with TC Energy's ID), and the oil tracker lists owner IDs only. `companyHomePage` (`jobs/lib/gem.ts`) tries the row's IDs, then a name only one company has.
- Oil terminals are curated only (`data/curated/oil-terminals.json`). Their locations come from PortWatch's ports database or a GEM pipeline end, never from memory; mark a point that's near but not at the terminal with `pointApprox`. Disruptions at a terminal use `assetKind: 'terminal'` and show on the pipelines that end there.
- Measured flow evidence is derived in the browser (`withMeasuredEvidence`, and `withMeasuredLngEvidence` for ALSI send-out), not stored in `pipelines.json` or `lng-terminals.json`. So are Home's measured changes (`src/lib/measuredChanges.ts`, thresholds in `MEASURED_CHANGES`).
- Home's "Latest updates" cards (up to `HOME_HERO.cards`) are the disruptions in effect with the newest source `publishedAt` (`lastReported`), not the newest start. Adding a source to an old disruption moves its card to the front.
- PortWatch fails queries at random. `fetch:portwatch` fetches each chokepoint and port on its own (`eachWithFallback` in `jobs/lib/output.ts`), tries failures once more, then keeps that one's previous series. The run still counts as failed (`lastAttempt.ok: false`, red in Actions) so it's visible.
- ALSI now and then answers a facility with an empty page; `fetch:alsi` asks again before reporting it as having no data.
- MapLibre 6 loads its worker from a separate file. `src/map/MapView.tsx` imports it with `?url` and calls `setWorkerUrl`; without that, tiles never load in dev or in the build.
- The claims refresh never trusts what the model says about a page: `verifyDraft` (`jobs/lib/claims.ts`) fetches it and checks the quote and the metadata date. Haiku has invented dates from "days ago" labels; the date check caught it. Keep the checks in code, not in the prompt.
- "Where is my fuel from?" (M7): EIA's refinery and blender net production of gasoline counts blending of components shipped in, so it is never "made in the region". That share is what the region used minus receipts and imports. The region view's fuel is `fuel=` in the URL, left out for gasoline.
- EIA's import totals by PADD can hold more than the countries it names (Gulf Coast gasoline blending components, 2026-08: 834 total, 765 named). The rest is kept as one `EIA.unnamedPartner` row and always folds into "other countries"; countries adding up to more than the total still fail the fetch.
- "Where is my oil from?" (M6) shares are of crude flowing into a PADD (imports, receipts from other PADDs, field production), not of refinery input; the residual method went negative for the Midwest. A ZIP code or city never goes in the URL, only `region/padd-n`.
- News scan (M9): Google News links are Google redirects that can't be read, so Google News only ranks stories; the article comes from a GDELT link or a search of the publisher's site. GDELT answers 429 at its documented 5-second pace (`NEWS.gdeltGapMs` is 8 s) and reports errors as plain text with status 200. Anthropic's web search rejects a whole request when an allowed domain blocks its crawler (reuters.com does); `scan-news.ts` drops those and retries. Names that are also common words or tickers go in `NEWS.weakTerms` (Druzhba is a football club too).
- A source marked `unreviewed: true` was committed by the news scan without a person checking it, and the page says so. Delete the field to mark it reviewed.
- Gas storage and Fuel origins are off (`FEATURES.gasStorage`, `FEATURES.fuelOrigins`). `viewEnabled` and `selectionEnabled` (`src/lib/views.ts`) gate the rail, search, links, the layer list and Home's figure; their smoke tests skip while off, and the fetches still run. Turn one on and its tests run again.
- A surface draws only its own map layers (`VIEW_LAYERS`) plus the open item's (`visibleLayers`); the layer list is Home's alone. A new surface needs an entry in `VIEW_LAYERS`.
- "What changed since last visit" is off (`FEATURES.visitChanges` in `src/lib/config.ts`); its smoke test skips while it is. When on, it lives in `localStorage` under `et.visits` (`src/lib/summary.ts`). To see changes locally, edit the stored `current` snapshot (older `savedAt`, a different status) and reload; the smoke test does the same.
