import { describe, expect, it } from 'vitest';
import { chokepointRadiusPx, pipelineStatus, pipelineWidthPx } from '../src/lib/encoding';
import { CHOKEPOINT_RADIUS, PIPELINE_WIDTH } from '../src/lib/config';
import { chokepoint, pipeline } from './fixtures';

describe('pipelineWidthPx', () => {
  it('uses a hairline when capacity is unknown', () => {
    expect(pipelineWidthPx(pipeline())).toBe(PIPELINE_WIDTH.minPx);
  });

  it('grows with capacity and caps at the maximum', () => {
    const small = pipelineWidthPx(pipeline({ capacity: { value: 5, unit: 'bcm/yr' } }));
    const large = pipelineWidthPx(pipeline({ capacity: { value: 55, unit: 'bcm/yr' } }));
    const huge = pipelineWidthPx(pipeline({ capacity: { value: 5000, unit: 'bcm/yr' } }));
    expect(large).toBeGreaterThan(small);
    expect(huge).toBe(PIPELINE_WIDTH.maxPx);
  });

  it('sizes oil by gas equivalent', () => {
    const oil = pipelineWidthPx(pipeline({ capacity: { value: 1, unit: 'mb/d' } }));
    const gas = pipelineWidthPx(pipeline({ capacity: { value: PIPELINE_WIDTH.oilMbdToGasBcm, unit: 'bcm/yr' } }));
    expect(oil).toBe(gas);
  });

  it('draws planned and under-construction lines as hairlines', () => {
    const capacity = { value: 55, unit: 'bcm/yr' } as const;
    const evidence = (status: 'planned' | 'under_construction') => [
      { status, sourceType: 'dataset' as const, observedAt: '2025-01-01', recordedAt: '2026-10-28' },
    ];
    expect(pipelineWidthPx(pipeline({ capacity, evidence: evidence('planned') }))).toBe(PIPELINE_WIDTH.minPx);
    expect(pipelineWidthPx(pipeline({ capacity, evidence: evidence('under_construction') }))).toBe(PIPELINE_WIDTH.minPx);
  });

  it('draws approximate geometry thinner', () => {
    const capacity = { value: 30, unit: 'bcm/yr' } as const;
    expect(pipelineWidthPx(pipeline({ capacity, geometryApprox: true }))).toBeLessThan(
      pipelineWidthPx(pipeline({ capacity })),
    );
  });
});

describe('pipelineStatus', () => {
  it('is unknown without evidence and evidence[0] otherwise', () => {
    expect(pipelineStatus(pipeline())).toBe('unknown');
    const evidence = [
      { status: 'offline' as const, sourceType: 'operator' as const, observedAt: '2022-09-26', recordedAt: '2026-10-28' },
    ];
    expect(pipelineStatus(pipeline({ evidence }))).toBe('offline');
  });
});

describe('chokepointRadiusPx', () => {
  it('makes ring area proportional to volume, with a floor', () => {
    const a = chokepointRadiusPx({ ...chokepoint('hormuz', [0, 0]), eiaReferenceMbd: 4 });
    const b = chokepointRadiusPx({ ...chokepoint('hormuz', [0, 0]), eiaReferenceMbd: 16 });
    expect(b / a).toBeCloseTo(2);
    expect(chokepointRadiusPx({ ...chokepoint('panama', [0, 0]), eiaReferenceMbd: 0 })).toBe(CHOKEPOINT_RADIUS.minPx);
  });
});

import { flowFillRadiusPx, FLOW_FILL_MAX_INDEX } from '../src/lib/encoding';

describe('flowFillRadiusPx', () => {
  it('fills the ring exactly at baseline and scales area with the index', () => {
    expect(flowFillRadiusPx(10, 1)).toBe(10);
    expect(flowFillRadiusPx(10, 0.25)).toBe(5);
  });

  it('caps large indexes and draws nothing without one', () => {
    expect(flowFillRadiusPx(10, 9)).toBe(flowFillRadiusPx(10, FLOW_FILL_MAX_INDEX));
    expect(flowFillRadiusPx(10, null)).toBe(0);
    expect(flowFillRadiusPx(10, 0)).toBe(0);
  });
});
