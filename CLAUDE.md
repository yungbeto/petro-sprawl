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

Add install, dev, test and data-job commands here during M0.
