import { useId } from 'react';
import type { FlowBand } from '../lib/flow';
import type { ObservationSeries } from '../types';

type Point = ObservationSeries['points'][number];

export interface ReferenceLine {
  value: number;
  label: string;
  style: 'dashed' | 'dotted';
}

interface SparklineProps {
  points: Point[];
  references: ReferenceLine[];
  unit: string;
  /** The line's name in the key: how often its points come. */
  lineLabel?: string;
  label: string;
  /** How the caption shows the maximum; whole numbers by default. */
  format?: (value: number) => string;
  /** Tints the line and its fill by a flow band, as the list's cards are. */
  band?: FlowBand | null;
}

const WIDTH = 352;
const HEIGHT = 72;
const PAD_TOP = 4;

/** The soft fill under every line chart: the line's color, fading to nothing at the baseline. */
function AreaFill({ id, line, width, height }: { id: string; line: string; width: number; height: number }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
    </>
  );
}

/**
 * Hand-rolled SVG line with horizontal reference lines and a soft fill under the line. Y axis starts
 * at zero. Line, fill and key take the chart's color: the text's, or a flow band's.
 */
export function Sparkline({ points, references, unit, label, lineLabel = 'Daily', format = (v) => String(Math.round(v)), band }: SparklineProps) {
  const gradient = useId();
  if (points.length < 2) return <p className="muted">Not enough data for a chart.</p>;
  const max = Math.max(...points.map((p) => p.value), ...references.map((r) => r.value), 1) * 1.05;
  const x = (i: number) => (i / (points.length - 1)) * WIDTH;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (HEIGHT - PAD_TOP);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const first = points[0]!;
  const last = points.at(-1)!;

  return (
    <figure className={`sparkline${band ? ` sparkline--${band}` : ''}`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <AreaFill id={gradient} line={path} width={WIDTH} height={HEIGHT} />
        {references.map((r) => (
          <line
            key={r.label}
            className={`sparkline__ref sparkline__ref--${r.style}`}
            x1="0"
            x2={WIDTH}
            y1={y(r.value)}
            y2={y(r.value)}
          />
        ))}
        <path className="sparkline__line" d={path} />
      </svg>
      <figcaption className="sparkline__caption mono">
        <span>{first.date}</span>
        <span>
          max {format(max / 1.05)} {unit}
        </span>
        <span>{last.date}</span>
      </figcaption>
      <ul className="sparkline__legend">
        <li>
          <span className="sparkline__key sparkline__key--line" /> {lineLabel}
        </li>
        {references.map((r) => (
          <li key={r.label}>
            <span className={`sparkline__key sparkline__key--${r.style}`} /> {r.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

const MINI_WIDTH = 300;
const MINI_HEIGHT = 36;

/**
 * A small line for a list row: the last 90 days against one dashed baseline, no caption. The line and a
 * soft fill under it take the element's `color`, so a row can tint it by its band.
 */
export function MiniSparkline({ points, reference, label, className }: { points: Point[]; reference: number | null; label: string; className?: string }) {
  const gradient = useId();
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value), reference ?? 0, 1) * 1.1;
  const x = (i: number) => (i / (points.length - 1)) * MINI_WIDTH;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (MINI_HEIGHT - PAD_TOP);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  return (
    <svg
      className={`mini-sparkline${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <AreaFill id={gradient} line={line} width={MINI_WIDTH} height={MINI_HEIGHT} />
      {reference !== null && (
        <line className="sparkline__ref sparkline__ref--dashed" x1="0" x2={MINI_WIDTH} y1={y(reference)} y2={y(reference)} />
      )}
      <path className="mini-sparkline__line" d={line} />
    </svg>
  );
}
