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

The app is not scaffolded yet. Milestone M0 in `SPEC.md` is the next build step, so there is no package install, dev server, or test suite.

Node.js 22 and Python 3 are the local toolchain. Node 22 is the runtime SPEC section 8 names for the app and data jobs. Cloud Agent images already provide both, and login shells can see them on `PATH`.

The only program in the repo today sorts the Reuters follow list. It uses the Python standard library and rewrites the CSV at the path you pass:

```bash
python3 scripts/classify_follows.py data/companies/reuters-follows-raw.tsv data/companies/follows-sorted.csv
```

To check the script without touching the committed file, write the CSV under `/tmp` and compare it with `data/companies/follows-sorted.csv`.
