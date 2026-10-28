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
