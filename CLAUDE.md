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

Data-job commands get added in M2.

## Gotchas

- MapLibre 6 loads its worker from a separate file. `src/map/MapView.tsx` imports it with `?url` and calls `setWorkerUrl`; without that, tiles never load in dev or in the build.
