// Visual encodings that depend only on the data: line widths, ring sizes, current status.

import type { AssetStatus, Chokepoint, Pipeline } from '../types';
import { CHOKEPOINT_RADIUS, PIPELINE_WIDTH } from './config';

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
