# Design system

Started 2026-11-05 from a UI audit of `src/styles/` and `src/panel/`. This file is the system's reference:
the tokens, the text styles and the components, and the rules for using them. The audit that started it is at
the end. Sentence case, no uppercase eyebrows, no em dashes, as everywhere in the app.

Status: step 1 of the plan is done (2026-11-05): every token below exists in `src/styles/tokens.css` and
`base.css` uses them. Text styles and shared components are proposed and not built yet.

## Principles

- One way to do each thing. A new surface uses the components here; a new look is added here first.
- Tokens, never raw values, for colour, type size, space, radius, elevation and motion. Raw values are fine
  only for one-off geometry (an icon's size, a chart's height).
- Light and dark from the same tokens. Every colour token has a dark value, in both dark blocks of
  `tokens.css`; `tests/theme.test.ts` checks it.
- Figures read in sans with tabular digits (`.num-inline`). Mono (`.mono`) is for what's read character by
  character: ISO dates, times, codes (country codes, routes, ids) and coordinates, and chart labels.

## Tokens

### Colour (exists)

| Group | Tokens | Use |
| --- | --- | --- |
| Neutrals | `--bg`, `--surface`, `--surface-sunken`, `--surface-subtle`, `--text`, `--text-muted`, `--border`, `--border-strong`, `--focus`, `--image-outline` | Every surface and text |
| Status | `--status-operating`, `--status-reduced`, `--status-offline`, `--status-unknown` | An asset's status, nothing else |
| Flow band | `--flow-below`, `--flow-near`, `--flow-above` | Measured against a baseline; `--flow-near` doubles as the neutral bar fill |
| Data age | `--data-stale` | Stale data, unverified claims |
| Map | `--map-*` | Map layers only (read by the map code as hex) |

`--text-subtle` is for notes and captions: quieter than `--text-muted`, still 4.5:1 on `--surface` and
`--surface-subtle` in both themes (light #6c7178, 4.9:1; dark #868b92, 5.1:1).

### Type scale

Eight steps, each a token. The app menu's tagline is the one size outside it, a fluid
`clamp(32px, 4.6vw, 52px)` for the page's single brand moment.

| Token | Size | Replaces | For |
| --- | --- | --- | --- |
| `--text-xs` | 11px | 10px, 11px | Notes, captions, chart labels |
| `--text-sm` | 12px | 12px | Secondary text, asides, meta lines |
| `--text-ui` | 13px | 13px | Buttons, chips, tabs, panel title |
| `--text-md` | 14px | 14px | Body, section titles |
| `--text-lg` | 16px | 16px, 17px | Lead text, search input, status |
| `--text-xl` | 20px | 20px, 22px | Page titles |
| `--text-figure` | 24px | 24px | A card's figure |
| `--text-display` | 36px | 32px, 36px | A page's headline figure |

Weights: 400, 500 (labels, figures, emphasis), 600 (titles). Line heights: 1.25 for titles and figures,
1.5 for running text, 16px/20px fixed for single-line UI.

### Space, radius, elevation, motion, layers

| Kind | Tokens |
| --- | --- |
| Space | `--space-half` (2px), `--space-1` to `--space-6` (4 to 32) |
| Radius | `--radius-sm` (2: bars, tags, keys), `--radius` (4: controls), `--radius-lg` (8: cards), `--radius-xl` (16: the phone sheet), `--radius-full` (pills); `50%` stays for circles. Nested corners are concentric: the segmented control is `--radius` plus its 2px inset |
| Elevation | `--ring` (a card's edge, every card), `--shadow-md`, `--shadow-float`, `--shadow-float-hover` |
| Motion | `--ease-out`, `--duration-fast` (120ms), `--duration-sheet` (260ms) |
| Layers | `--z-map-controls` 2, `--z-panel` 3, `--z-header` 4, `--z-sheet` 5, `--z-rail` 6, `--z-tooltip` 10, `--z-scrim` 20, `--z-dialog` 21. Stacking inside one component keeps small raw numbers |

## Text styles (proposed)

Classes that set size, weight, line height and colour together, so a title is a title everywhere.

| Class | Style | Today written as |
| --- | --- | --- |
| `.t-display` | 36/1.1, 500, proportional digits | `.flow-headline__figure`, `.tile__value`, `.hero__headline` |
| `.t-title` | 20/1.25, 600, balanced | `.detail__title`, `.hero__title`, `.app-header__title` |
| `.t-section` | 14, 600, balanced | `.section__title`, `.disruption__label` (14 vs 12 today) |
| `.t-figure` | 24/28, 500, tabular, -0.02em | `.stat-card__value` |
| `.t-body` | 14/1.5, pretty | summaries, report statements |
| `.t-small` | 12, muted | `.facts__aside`, `.stats__aside`, `.view-headline`, meta lines |
| `.t-note` | 11, subtle | `.stat-card__notes`, `.disruption__note`, `.source` |
| `.t-label` | 12, muted | a figure's label: `.lead-card__label`, `.flow-meter` |

## Components

What exists as a pattern today, and the one component each should become. "Exists" means there's a React
component; the rest are class patterns repeated by hand.

| Component | Replaces | Variants | Exists |
| --- | --- | --- | --- |
| `Card` | `.chart-card`, `.hero-card` (border, not ring), `.lead-card`, `.disruption` | static; interactive (list rows: `.view-row`, `.group-row`, `.tile` hover) | No |
| `LeadCard` | the figure cards | figure + against + bar + notes + chart | Yes (details.tsx) |
| `StatusBlock` | the status card, written out 3 times (pipelines, LNG, oil terminals) | with measured claim, unverified | No |
| `FactRows` / `Row` | `.facts`, `.key-facts` | with aside | Yes (`Row`) |
| `Bar` | `.fill-bar`, `.oil-bar`, `.part-bar`, the origins and group bars, `FillBar` | one value; parts; with tick | Partly (`FillBar`, `OilBar`) |
| `Status` | `.status status--*` | dot + label | No (class only) |
| `Band` | `.band` | below, near, above | Yes |
| `Tag` | `.tag`, `.disruption__cause` | neutral | No |
| `Chip` | `.chip`, `.segmented__option`, `.group-by` | toggle, with count | No |
| `Tabs` | `.fuel-tabs` | underline | Yes (`FuelTabs`) |
| `Button` | `.button`, `.icon-button`, `.link-button` | default, icon, text | No |
| `SectionTitle` | `.section__title`, `.title-row` + `Info` | with count, with info, with a control | No |
| `Sparkline` | the 90-day and 12-month charts | references, band tone | Yes |
| `Note` | `.source`, `.note`, `.report__unreviewed`, `.disruption__note` | source, unreviewed | No |

Proposed home: `src/ui/` for the components, one file each, with their CSS in `src/styles/components/`.
`base.css` (4,053 lines) keeps resets and layout; `details.tsx` (1,898 lines) keeps the pages.

## Audit, 2026-11-05

### Fixed

- **Dark tokens out of step.** The system-dark block in `tokens.css` declared 12 tokens twice; the manual-dark
  block (Dark chosen in the menu) was missing 11, so with Dark chosen on a light system the gas storage and
  oil import map fills, basin focus and floating controls' shadows stayed light. Both blocks now come from one
  list, and a test keeps them identical.

### Found

- **Type: 13 sizes, 4 outside the tokens most of the time.** `--text-sm` is used 57 times and `--text-xs`
  24, but 13px (7), 16px (5), 20px (3), 24px (2), 10px (2), 22px, 32px, 36px and a clamp are written raw.
  16 different line heights.
- **Contrast.** `.stat-card__notes` is 10px at 60% of `--text-muted`: about 2.5:1 on white, under the 4.5:1
  WCAG AA asks of small text. The new figure cards and the disruption card reuse it.
- **Two card edges.** `.chart-card` draws its edge with a 1px ring, `.hero-card` with a 1px border and a
  subtle fill. Cards on the same page look slightly different.
- **Radii.** 16 values: tokens (28 uses), and 2, 3, 6, 13 and 24px raw.
- **Raw spacing.** Space tokens are used 226 times, but `gap: 2px` (10) and `6px` (6), and paddings like
  `4px 8px`, `6px 10px`, `0 5px` are written raw.
- **Mono for figures.** Some figures are mono (length, coordinates, LNG unit table, the "when built" total
  until today), others sans; capacity and age sit side by side in different faces.
- **Repeated markup.** The status block is written out three times; five bar implementations; four pill
  styles (`.tag`, `.chip`, `.band`, `.disruption__cause`).
- **Motion.** Durations are 120ms almost everywhere, with 260ms and 400ms; the easing curve is written out
  four times beside the `--ease-out` token that holds it.
- **Layers.** Nine z-index values (1 to 21), unnamed.
- **Size.** One stylesheet of 4,053 lines and one 1,898-line component file hold most of the UI.

### Holding up

- Colour is almost entirely tokens: no raw colours in `base.css` beyond scrims and shadows.
- Hit areas: small controls (`.icon-button`, `.segmented__option`) extend to 40px with a pseudo-element.
- Focus: one `:focus-visible` style app-wide.
- Status, flow band and data age have their own semantic tokens and aren't reused for decoration.

## Plan

1. Done 2026-11-05. Tokens for type, radius, ring, motion and layers, and `base.css` moved onto them;
   near sizes merged (10 to 11px, 17 to 16px, 22 to 20px, 32 to 36px); notes on `--text-subtle`; Home's
   cards on the ring; figures out of mono.
2. Text styles: the `.t-*` classes, and the title, figure and note classes moved onto them.
3. Components, most repeated first: `StatusBlock`, `Bar`, `Card`, `Tag`/`Chip`, `Button`, `SectionTitle`,
   `Note`.
4. Split `base.css` and `details.tsx` along the component lines.
