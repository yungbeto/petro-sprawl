import { describe, expect, it } from 'vitest';
import { formatCapacity, formatLonLat, formatMbd } from '../src/lib/format';

describe('format', () => {
  it('keeps source precision for capacity', () => {
    expect(formatCapacity({ value: 15.75, unit: 'bcm/yr' })).toBe('15.75 bcm/yr');
    expect(formatCapacity({ value: 55, unit: 'bcm/yr' })).toBe('55 bcm/yr');
    expect(formatCapacity({ value: 1.486, unit: 'mb/d' })).toBe('1.486 mb/d');
  });

  it('formats volumes and coordinates', () => {
    expect(formatMbd(24)).toBe('24.0 mb/d');
    expect(formatLonLat([56.8598, 26.2969])).toBe('26.2969° N, 56.8598° E');
    expect(formatLonLat([-79.7672, 9.1205])).toBe('9.1205° N, 79.7672° W');
  });
});

import { formatIndex, formatIndexShare } from '../src/lib/format';

describe('index formatting', () => {
  it('shows shares as whole percents, with <1% for tiny non-zero values', () => {
    expect(formatIndexShare(0.017)).toBe('2%');
    expect(formatIndexShare(0.531)).toBe('53%');
    expect(formatIndexShare(1.04)).toBe('104%');
    expect(formatIndexShare(0.004)).toBe('<1%');
    expect(formatIndexShare(0)).toBe('0%');
    expect(formatIndex(0.0567)).toBe('0.06');
  });
});
