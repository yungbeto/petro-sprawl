import { describe, expect, it } from 'vitest';
import { MOBILE } from '../src/lib/config';
import { liftDetent, nextDetent, sheetHeights, snapDetent, type Detent } from '../src/lib/sheet';

describe('bottom sheet', () => {
  // An iPhone 15: search bar ends at 64px, the tab bar starts at 762px.
  const heights = sheetHeights({ headerBottom: 64, barTop: 762 });

  it('reaches up to the search bar at full, a share of the screen at half, and peeks at the top of the panel', () => {
    expect(heights).toEqual({ hidden: MOBILE.hiddenPx, peek: MOBILE.peekPx, half: 381, full: 762 - 64 - MOBILE.gapBelowHeaderPx });
  });

  it('never lets peek or half outgrow a short screen', () => {
    expect(sheetHeights({ headerBottom: 64, barTop: 180 })).toEqual({ hidden: MOBILE.hiddenPx, peek: 108, half: 108, full: 108 });
  });

  it('snaps to the nearest height, carried on by a flick', () => {
    expect(snapDetent(heights, 200, 0)).toBe('peek');
    expect(snapDetent(heights, 300, 0)).toBe('half');
    expect(snapDetent(heights, 300, 2)).toBe('full');
    expect(snapDetent(heights, 500, -2.5)).toBe('peek');
  });

  it('hides down to the handle when dragged or flicked below peek', () => {
    expect(snapDetent(heights, 60, 0)).toBe('hidden');
    expect(snapDetent(heights, 180, -1)).toBe('hidden');
  });

  it('steps through the heights on a tap', () => {
    expect((['hidden', 'peek', 'half', 'full'] as Detent[]).map(nextDetent)).toEqual(['peek', 'half', 'full', 'peek']);
  });

  it('opening something lifts a hidden or peeking sheet to half, and leaves a taller one', () => {
    expect((['hidden', 'peek', 'half', 'full'] as Detent[]).map(liftDetent)).toEqual(['half', 'half', 'half', 'full']);
  });
});
