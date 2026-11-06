// Bars (docs/design-system.md): one value on a track (MeterBar) or parts of a whole (PartsBar). Every bar in
// the app is one of these two; styles in src/styles/components/bar.css.

import type { ReactNode } from 'react';

/**
 * A bar's colour, as a class suffix. Neutral is the default fill (how full, how much), never a judgement;
 * the status tones are for statuses only; outline is for what isn't there yet (planned, undiscovered).
 */
export type BarTone = 'neutral' | 'soft' | 'strong' | 'muted' | 'ink' | 'outline' | 'operating' | 'offline' | 'unknown';

/** 4px in lists, 6px in compact cards, 8px as a card's own bar. */
export type BarSize = 'sm' | 'md' | 'lg';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * One value from empty to full, 0 to 1 (clamped), with an optional tick for a reference (last year), named
 * on hover. `label` makes it an image for screen readers; leave it out when the figure is beside it.
 */
export function MeterBar({
  value,
  tone = 'neutral',
  size = 'lg',
  minVisible = 0,
  tick,
  label,
}: {
  value: number;
  tone?: BarTone;
  size?: BarSize;
  /** A floor, 0 to 1, so a tiny share still shows a sliver. */
  minVisible?: number;
  tick?: { value: number; tip: ReactNode };
  label?: string;
}) {
  const width = clamp(Math.max(value, value > 0 ? minVisible : 0) * 100);
  const at = tick && clamp(tick.value * 100);
  return (
    <span className={`bar bar--${size}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <span className={`bar__fill bar__tone--${tone}`} style={{ width: `${width}%` }} />
      {tick && at !== undefined && (
        <span className="bar__tick" style={{ left: `${at}%` }}>
          {/* Slid along by the tick's own position, so it never runs past either end of the bar. */}
          <span className="bar__tip" style={{ translate: `-${at}% 0` }} aria-hidden="true">
            {tick.tip}
          </span>
        </span>
      )}
    </span>
  );
}

export interface BarPart {
  key: string;
  value: number;
  tone: BarTone;
  /** Shown on hover, above the part. */
  tip?: ReactNode;
  /** A native tooltip instead of a styled tip. */
  title?: string;
  faint?: boolean;
}

/** Parts of a whole side by side, each as wide as its share, with a hairline gap between them. */
export function PartsBar({ parts, size = 'lg', label }: { parts: BarPart[]; size?: BarSize; label?: string }) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  let start = 0;
  return (
    <span className={`bar bar--parts bar--${size}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {parts.map((p) => {
        const share = (Math.max(0, p.value) / total) * 100;
        // The tip is centred on its part, slid along so it never runs past either end of the bar.
        const centre = start + share / 2;
        start += share;
        if (share === 0) return null;
        return (
          <span key={p.key} className="bar__slot" style={{ flexGrow: share }} title={p.title}>
            <span className={`bar__part bar__tone--${p.tone}${p.faint ? ' bar__part--faint' : ''}`} />
            {p.tip && (
              <span className="bar__tip bar__tip--part" style={{ left: `${centre}%`, translate: `-${centre}% 0` }} aria-hidden="true">
                {p.tip}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** A swatch in a tone, for a bar's key. */
export function BarSwatch({ tone }: { tone: BarTone }) {
  return <span className={`bar-swatch bar__tone--${tone}`} aria-hidden="true" />;
}
