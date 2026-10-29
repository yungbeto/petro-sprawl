// Visual encodings that depend only on the data: line widths, ring sizes, current status.

import type { AssetStatus, Chokepoint, LngTerminal, OilTerminal, Pipeline, PipelineHistory } from '../types';
import { CHOKEPOINT_RADIUS, LNG_RADIUS, PIPELINE_WIDTH } from './config';

export function pipelineStatus(pipeline: Pipeline): AssetStatus {
  return pipeline.evidence[0]?.status ?? 'unknown';
}

/** Not built yet: drawn as a hairline whatever its planned capacity (SPEC section 5). */
const UNBUILT: AssetStatus[] = ['planned', 'under_construction', 'cancelled'];

/** Line width in px from capacity; hairline when capacity is unknown or the line isn't built. */
export function pipelineWidthPx(pipeline: Pipeline): number {
  const { minPx, maxPx, scale, oilMbdToGasBcm, approxFactor } = PIPELINE_WIDTH;
  const cap = pipeline.capacity;
  let width: number = minPx;
  if (cap && !UNBUILT.includes(pipelineStatus(pipeline))) {
    const bcm = cap.unit === 'mb/d' ? cap.value * oilMbdToGasBcm : cap.value;
    width = Math.min(maxPx, Math.max(minPx, Math.sqrt(bcm) * scale));
  }
  return pipeline.geometryApprox ? Math.max(minPx, width * approxFactor) : width;
}

export function chokepointRadiusPx(chokepoint: Chokepoint): number {
  return Math.max(CHOKEPOINT_RADIUS.minPx, Math.sqrt(chokepoint.eiaReferenceMbd) * CHOKEPOINT_RADIUS.scale);
}

export function lngStatus(terminal: LngTerminal): AssetStatus {
  return terminal.evidence[0]?.status ?? 'unknown';
}

/** The newest cited claim's status; unknown when nothing could be sourced. */
export function terminalStatus(terminal: OilTerminal): AssetStatus {
  return terminal.evidence[0]?.status ?? 'unknown';
}

/** Dot radius from capacity in operation, or from planned capacity when nothing operates yet. */
export function lngRadiusPx(terminal: LngTerminal): number {
  const { scale, minPx, maxPx } = LNG_RADIUS;
  const mtpa = terminal.capacityMtpa.operating || terminal.capacityMtpa.planned;
  return Math.min(maxPx, Math.max(minPx, Math.sqrt(mtpa) * scale));
}

/** Largest flow index the inner disk shows; beyond this it stays at this size. */
export const FLOW_FILL_MAX_INDEX = 1.5;

/**
 * Inner disk radius for a chokepoint: its area is the flow index times the ring's area,
 * so a full ring means flow at baseline. The non-color cue that pairs with the band color.
 */
export function flowFillRadiusPx(ringRadiusPx: number, index: number | null): number {
  if (index === null || index <= 0) return 0;
  return ringRadiusPx * Math.sqrt(Math.min(index, FLOW_FILL_MAX_INDEX));
}

/**
 * Inner line for measured flow: the outer width times the share of capacity, capped at the
 * outer width, and never thinner than a hairline while gas is moving.
 */
export function flowLineWidthPx(outerPx: number, share: number): number {
  if (share <= 0) return 0;
  return Math.max(PIPELINE_WIDTH.minPx * 0.75, outerPx * Math.min(share, 1));
}

/**
 * Whole years from the first section's start to now, or to the stop year for a line that stopped.
 * Never negative: a start year GEM dates later than today counts as zero.
 */
export function pipelineAge(history: PipelineHistory, now: Date): number {
  const first = history.startYears[0];
  if (first === undefined) return 0;
  const end = history.stopYear ?? now.getUTCFullYear();
  return Math.max(0, end - first);
}

/**
 * The total of the listed shares when every company has one and they fall short of the whole
 * (GEM sometimes lists only the larger holders); null otherwise, so nothing needs saying.
 */
export function shareCoverage(companies: { sharePct?: number }[]): number | null {
  if (!companies.length || companies.some((c) => c.sharePct === undefined)) return null;
  const total = companies.reduce((sum, c) => sum + c.sharePct!, 0);
  return total < 99.5 ? Math.round(total * 10) / 10 : null;
}
