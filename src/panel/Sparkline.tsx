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
  label: string;
  /** How the caption shows the maximum; whole numbers by default. */
  format?: (value: number) => string;
}

const WIDTH = 352;
const HEIGHT = 72;
const PAD_TOP = 4;

/** Hand-rolled SVG line with horizontal reference lines. Y axis starts at zero. */
export function Sparkline({ points, references, unit, label, format = (v) => String(Math.round(v)) }: SparklineProps) {
  if (points.length < 2) return <p className="muted">Not enough data for a chart.</p>;
  const max = Math.max(...points.map((p) => p.value), ...references.map((r) => r.value), 1) * 1.05;
  const x = (i: number) => (i / (points.length - 1)) * WIDTH;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (HEIGHT - PAD_TOP);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const first = points[0]!;
  const last = points.at(-1)!;

  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <line className="sparkline__axis" x1="0" x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
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
          <span className="sparkline__key sparkline__key--line" /> Daily
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
const MINI_HEIGHT = 32;

/** A small line for a list row: the last 90 days against one dashed baseline, no caption. */
export function MiniSparkline({ points, reference, label }: { points: Point[]; reference: number | null; label: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value), reference ?? 0, 1) * 1.05;
  const x = (i: number) => (i / (points.length - 1)) * MINI_WIDTH;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (MINI_HEIGHT - PAD_TOP);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  return (
    <svg className="mini-sparkline" viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line className="sparkline__axis" x1="0" x2={MINI_WIDTH} y1={MINI_HEIGHT - 0.5} y2={MINI_HEIGHT - 0.5} />
      {reference !== null && (
        <line className="sparkline__ref sparkline__ref--dashed" x1="0" x2={MINI_WIDTH} y1={y(reference)} y2={y(reference)} />
      )}
      <path className="sparkline__line" d={path} />
    </svg>
  );
}
