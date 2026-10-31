import { describe, expect, it } from 'vitest';
import { MOBILE } from '../src/lib/config';
import { nextDetent, sheetHeights, snapDetent } from '../src/lib/sheet';

describe('bottom sheet', () => {
  // An iPhone 15: search bar ends at 64px, the tab bar starts at 762px.
  const heights = sheetHeights({ headerBottom: 64, barTop: 762 });

  it('reaches up to the search bar at full, a share of the screen at half, and peeks at the top of the panel', () => {
    expect(heights).toEqual({ peek: MOBILE.peekPx, half: 381, full: 762 - 64 - MOBILE.gapBelowHeaderPx });
  });

  it('never lets peek or half outgrow a short screen', () => {
    expect(sheetHeights({ headerBottom: 64, barTop: 180 })).toEqual({ peek: 108, half: 108, full: 108 });
  });

  it('snaps to the nearest height, carried on by a flick', () => {
    expect(snapDetent(heights, 200, 0)).toBe('peek');
    expect(snapDetent(heights, 300, 0)).toBe('half');
    expect(snapDetent(heights, 300, 2)).toBe('full');
    expect(snapDetent(heights, 500, -2.5)).toBe('peek');
  });

  it('steps through the heights on a tap', () => {
    expect(['peek', 'half', 'full'].map((d) => nextDetent(d as 'peek'))).toEqual(['half', 'full', 'peek']);
  });
});
