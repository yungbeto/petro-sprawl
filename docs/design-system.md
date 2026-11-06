# Design system

Started 2026-11-05 from a UI audit of `src/styles/` and `src/panel/`. This file is the system's reference:
the tokens, the text styles and the components, and the rules for using them. The audit that started it is at
the end. Sentence case, no uppercase eyebrows, no em dashes, as everywhere in the app.

Status (2026-11-06): tokens, text styles and the shared components in the table below are built, and the
big files are split (plan step 4). What's left marked "No" is a class pattern without a component yet.

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

## Text styles

Classes that set size, weight, line height and colour together, so a title is a title everywhere. They live
in `src/styles/text.css`, loaded after every other stylesheet. New code uses the `.t-*` class. Older component classes
are listed in the same rule (`.t-title, .detail__title, .hero__title`), so they take the style from there and
their own rules elsewhere hold only layout; don't set type on them again.

| Class | Style | Today written as |
| --- | --- | --- |
| `.t-display` | 36/1.1, 500, -0.02em, proportional digits | `.flow-headline__figure`, `.tile__value` |
| `.t-title` | 20/1.25, 600, balanced | `.detail__title`, `.hero__title` |
| `.t-section` | 14, 600, balanced | `.section__title` |
| `.t-figure` | 24/28, 500, -0.02em, tabular digits | `.stat-card__value` (also the lead cards' figure) |
| `.t-body` | 14/1.5, pretty | new running text |
| `.t-small` | 12, muted, pretty | `.facts__aside`, `.view-headline`, `.lead-card__label`, `.note`, `.source` |
| `.t-note` | 11/16, subtle, pretty | `.stat-card__notes`, `.disruption__note` |

Left as they are, each the one of its kind: the header's wordmark (`.app-header__title`), Home's headline
sentence (`.hero__headline`, 24/600), the menu's tagline and count, and the card-internal labels
(`.disruption__label`).

## Components

What exists as a pattern today, and the one component each should become. "Exists" means there's a React
component; the rest are class patterns repeated by hand.

| Component | Replaces | Variants | Exists |
| --- | --- | --- | --- |
| `Card`, `cardClass()` (`src/ui/Card.tsx`) | `.chart-card`, `.hero-card`'s own edge and fill, the list cards' edge (`.view-list--cards .view-row`) | static (chart sections, lead cards, disruptions); `interactive` (a card that's a button: the surfaces' list cards); `subtle` (tinted: Home's updates) | Yes |
| `LeadCard` | the figure cards | figure + against + bar + notes + chart | Yes (details.tsx) |
| `StatusBlock` | the status card, written out 3 times (pipelines, LNG, oil terminals) | with measured claim, unverified, custom empty text | Yes (details.tsx) |
| `FactRows` / `Row` | `.facts`, `.key-facts` | with aside | Yes (`Row`) |
| `MeterBar`, `PartsBar` (`src/ui/Bar.tsx`) | `.fill-bar`, `.oil-bar`, `.part-bar`, `.status-bar`, the origins and top-origins bars | one value with an optional tick; parts with tips or titles; sizes sm 4px, md 6px, lg 8px; tones below | Yes |
| `Status` | `.status status--*` | dot + label | No (class only) |
| `Band` | `.band` | below, near, above | Yes |
| `Tag` (`src/ui/Tag.tsx`) | `.tag`, the disruption cause | static, square corners: never a control | Yes |
| `Chip` (`src/ui/Chip.tsx`) | the map's filter chips, the search scopes | toggle with optional count; `float` over the map, `sm` in a dialog | Yes |
| `SegmentedOptions` (`src/ui/Segmented.tsx`) | the group-by switch (`Segmented` in GroupList wraps it with its label), the theme setting | one of a few | Yes |
| `Tabs` | `.fuel-tabs` | underline | Yes (`FuelTabs`) |
| `IconButton`, `TextButton` (`src/ui/Button.tsx`) | `.icon-button`, `.link-button` (the bordered `.button` had no uses left and is gone) | icon alone, named by `label`: `sm` 28px in a row of controls, `md` 32px in a bar (panel back and close, search close), `lg` 40px in the header, 40px hit area at every size; text, underlined like a link (show more, read more) | Yes |
| `SectionTitle` (`src/ui/SectionTitle.tsx`) | every hand-written heading and `.title-row`: `.detail__title`, `.section__title`, `.country-section__title` | `level` page (h2), section (h3), part (h3, a part of a country's page); `count`; an `Info` as children, beside the heading so its name stays its text; `aside` at the row's end (a chart's band, the terminals' kind switch) | Yes |
| Disruption timeline (`.timeline`, in `DisruptionCard`) | the sources list | date column, a rail with a filled dot for an event (our words, its source under it) and an open dot for a headline | Yes (status.tsx) |
| `Sparkline` | the 90-day and 12-month charts | references, band tone | Yes |
| `Note` (`src/ui/Note.tsx`) | `.source`, `.note`, `.report__unreviewed`, `.hero__unreviewed`, `.disruption__note` | `note` (an aside under a list), `source` (closes a page under a rule), `unreviewed` (under a claim or source nobody has checked), `caption` (the finest print, under a card) | Yes |

Bar tones (`BarTone`): `neutral` (how full, how much: the default), `soft` (what's spent: produced oil),
`outline` (not there yet: planned, undiscovered), `strong` and `muted` (lesser rows), `ink` (countries, as on
the map's arcs), and `operating`, `offline`, `unknown` for status mixes only.

Proposed home: `src/ui/` for the components, one file each, with their CSS in `src/styles/components/`.
Stylesheets (all imported by `src/main.tsx`, in cascade order): `tokens.css`; `base.css` (resets); `layout/`
(`shell.css` the frame, `map-search.css` what floats over the map, `phone.css`); `pages/` (`detail.css`,
`home.css`, `lists.css`, `menu.css`); `interaction.css`; `loading.css`; `components/`; `text.css` last. A new
file goes where its rules belong in that order. Detail pages are one file each in `src/panel/detail/`, with
what they share in `parts.tsx` and `status.tsx`; `src/panel/details.tsx` only re-exports them.

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

- Colour is almost entirely tokens: no raw colours in the stylesheets beyond scrims and shadows.
- Hit areas: small controls (`.icon-button`, `.segmented__option`) extend to 40px with a pseudo-element.
- Focus: one `:focus-visible` style app-wide.
- Status, flow band and data age have their own semantic tokens and aren't reused for decoration.

## Plan

1. Done 2026-11-05. Tokens for type, radius, ring, motion and layers, and `base.css` moved onto them;
   near sizes merged (10 to 11px, 17 to 16px, 22 to 20px, 32 to 36px); notes on `--text-subtle`; Home's
   cards on the ring; figures out of mono.
2. Done 2026-11-05. `.t-*` classes in `src/styles/text.css`; the title, figure, small and note classes take
   their type from there.
3. Done 2026-11-06. Components, most repeated first: `StatusBlock`, bars, `Card`, `Tag`/`Chip`/`SegmentedOptions`,
   `IconButton`/`TextButton`, `SectionTitle`, `Note`.
4. Done 2026-11-06. `base.css` split into the stylesheets above, in its original order, so the cascade is
   unchanged; `details.tsx` split into one file per page.
