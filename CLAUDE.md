# Working notes for Claude Code

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
| `npm run build:curated` | Validates `data/curated/`; publishes disruptions, merges the curated corridor pipelines with GEM rows into `public/data/pipelines.json`, adds cited LNG evidence (`data/curated/lng-evidence.json`) to GEM terminals in `public/data/lng-terminals.json`, and publishes the curated oil terminals (`data/curated/oil-terminals.json`); merge log in `data/reports/dedup.json` |
| `npm run import:basins` | Manual: USGS provinces from `data/raw/usgs/` to `public/data/basins.json`, tagged with countries from Natural Earth in `data/raw/naturalearth/`; report in `data/reports/import-basins.json` |
| `npm run import:countries` | Manual: Natural Earth country outlines in the theater to `public/data/countries.json` (storage layer), and each country's World Bank region to `public/data/country-regions.json` (pipelines by region) |
| `npm run import:gem` | Manual: GEM gas and oil pipeline GeoJSON from `data/raw/gem/` to `data/derived/gem-pipelines.json`; skip counts in `data/reports/import-gem.json`. Run `build:curated` after it |
| `npm run import:lng` | Manual: GEM LNG terminals (one row per unit) from `data/raw/gem/` to `data/derived/gem-lng-terminals.json`, grouped into terminals; report in `data/reports/import-lng.json`. Run `build:curated` after it |
| `npm run import:us-lookup` | Manual: Census ZCTA relationship file and city populations from `data/raw/census/`, EIA refinery locations from `data/raw/eia/refineries/` and Natural Earth label points to `public/data/us-lookup.json` (ZIP to state, cities, PADD hubs, country points) |
| `npm run import:us-regions` | Manual: Census 1:20m state outlines from `data/raw/census/` merged into the five PADDs (`PADDS` in `src/lib/config.ts`) to `public/data/us-regions.json`, for the fuel origins map |
| `npm run import:chokepoints` | PortWatch locations plus EIA volumes (from `src/lib/config.ts`) to `public/data/chokepoints.json` |

Hosting is Vercel (`vercel.json`): a static Vite build of `dist/`, with Deployment Protection set to All Deployments (Vercel Authentication), so every URL, production included, needs a Vercel login. Production is https://energy-terminal-omega.vercel.app. With the GitHub repo connected, every push to main deploys, including the data commits. `vercel curl <url>` fetches through the protection; `.vercelignore` keeps raw data, saved articles and secrets out of CLI uploads.

Scheduled jobs run every 6 hours in `.github/workflows/data.yml` and commit `public/data` when it changes. The claims refresh runs weekly in `.github/workflows/claims.yml`: confirmations go to main, other drafts open a pull request (the repository must allow GitHub Actions to create pull requests). Every job writes through `publishDataset` in `jobs/lib/output.ts`: new data must pass its zod schema or the previous file stays and the failure is recorded in `meta/<id>.json`.

## Gotchas

- Playwright runs Chromium on the GPU on macOS (`playwright.config.ts`). Software WebGL draws the pipeline layer at about 1 fps, so camera animations never settle and URL tests time out. CI without a GPU needs another plan.
- The dev server exposes the map as `window.__etMap` so the smoke test can click real features. Dev only.
- Pipelines and LNG terminals are built in two steps: `import:gem` / `import:lng` (raw GEM to `data/derived/`), then `build:curated` (curated records win). Edit `data/curated/pipelines-evidence.json` or `data/curated/lng-evidence.json`, never the files in `public/data/`.
- Oil terminals are curated only (`data/curated/oil-terminals.json`). Their locations come from PortWatch's ports database or a GEM pipeline end, never from memory; mark a point that's near but not at the terminal with `pointApprox`. Disruptions at a terminal use `assetKind: 'terminal'` and show on the pipelines that end there.
- Measured flow evidence is derived in the browser (`withMeasuredEvidence`, and `withMeasuredLngEvidence` for ALSI send-out), not stored in `pipelines.json` or `lng-terminals.json`. So are Home's measured changes (`src/lib/measuredChanges.ts`, thresholds in `MEASURED_CHANGES`).
- Home's lead story is the disruption in effect with the newest source `publishedAt` (`lastReported`), not the newest start. Adding a source to an old disruption moves it to the top.
- PortWatch fails queries at random. `fetch:portwatch` fetches each chokepoint and port on its own (`eachWithFallback` in `jobs/lib/output.ts`), tries failures once more, then keeps that one's previous series. The run still counts as failed (`lastAttempt.ok: false`, red in Actions) so it's visible.
- ALSI now and then answers a facility with an empty page; `fetch:alsi` asks again before reporting it as having no data.
- MapLibre 6 loads its worker from a separate file. `src/map/MapView.tsx` imports it with `?url` and calls `setWorkerUrl`; without that, tiles never load in dev or in the build.
- The claims refresh never trusts what the model says about a page: `verifyDraft` (`jobs/lib/claims.ts`) fetches it and checks the quote and the metadata date. Haiku has invented dates from "days ago" labels; the date check caught it. Keep the checks in code, not in the prompt.
- "Where is my fuel from?" (M7): EIA's refinery and blender net production of gasoline counts blending of components shipped in, so it is never "made in the region". That share is what the region used minus receipts and imports. The region view's fuel is `fuel=` in the URL, left out for gasoline.
- EIA's import totals by PADD can hold more than the countries it names (Gulf Coast gasoline blending components, 2026-08: 834 total, 765 named). The rest is kept as one `EIA.unnamedPartner` row and always folds into "other countries"; countries adding up to more than the total still fail the fetch.
- "Where is my oil from?" (M6) shares are of crude flowing into a PADD (imports, receipts from other PADDs, field production), not of refinery input; the residual method went negative for the Midwest. A ZIP code or city never goes in the URL, only `region/padd-n`.
- "What changed since last visit" is off (`FEATURES.visitChanges` in `src/lib/config.ts`); its smoke test skips while it is. When on, it lives in `localStorage` under `et.visits` (`src/lib/summary.ts`). To see changes locally, edit the stored `current` snapshot (older `savedAt`, a different status) and reload; the smoke test does the same.
