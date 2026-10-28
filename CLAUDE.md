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
| `npx playwright test` | Smoke test (`tests/e2e/`); starts its own dev server on port 5287 |
| `npm run import:basins` | Manual: USGS provinces from `data/raw/usgs/` to `public/data/basins.json` |
| `npm run import:gem` | Manual: GEM gas and oil pipeline GeoJSON from `data/raw/gem/` to `public/data/pipelines.json`; skip counts in `data/reports/import-gem.json` |
| `npm run import:chokepoints` | PortWatch locations plus EIA volumes (from `src/lib/config.ts`) to `public/data/chokepoints.json` |

Scheduled data-job commands get added in M2.

## Gotchas

- Playwright runs Chromium on the GPU on macOS (`playwright.config.ts`). Software WebGL draws the pipeline layer at about 1 fps, so camera animations never settle and URL tests time out. CI without a GPU needs another plan.
- The dev server exposes the map as `window.__etMap` so the smoke test can click real features. Dev only.
- MapLibre 6 loads its worker from a separate file. `src/map/MapView.tsx` imports it with `?url` and calls `setWorkerUrl`; without that, tiles never load in dev or in the build.
