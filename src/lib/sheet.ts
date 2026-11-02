// The phone layout's bottom sheet: its four heights and where a drag snaps to. Pure.

import { MOBILE } from './config';

export const DETENTS = ['hidden', 'peek', 'half', 'full'] as const;
export type Detent = (typeof DETENTS)[number];

export type SheetHeights = Record<Detent, number>;

/**
 * Heights for the room between the search bar's bottom and the tab bar's top, in px. Full reaches up
 * to just under the search bar; half is a share of the space above the tab bar; peek never exceeds either;
 * hidden is the handle alone.
 */
export function sheetHeights({ headerBottom, barTop }: { headerBottom: number; barTop: number }): SheetHeights {
  const full = Math.max(0, Math.round(barTop - headerBottom - MOBILE.gapBelowHeaderPx));
  const peek = Math.min(MOBILE.peekPx, full);
  const half = Math.min(full, Math.max(peek, Math.round(barTop * MOBILE.halfShare)));
  return { hidden: Math.min(MOBILE.hiddenPx, peek), peek, half, full };
}

/**
 * The detent nearest where the sheet would come to rest, carried on by a flick's speed (px per ms, up
 * positive). Hiding takes letting go below peek, so a flick down from half stops at peek.
 */
export function snapDetent(heights: SheetHeights, height: number, velocity: number): Detent {
  const resting = height + velocity * MOBILE.flickMs;
  const nearest = DETENTS.reduce((best, d) => (Math.abs(heights[d] - resting) < Math.abs(heights[best] - resting) ? d : best), 'peek' as Detent);
  return nearest === 'hidden' && height >= heights.peek ? 'peek' : nearest;
}

/** A tap on the handle: hidden comes back to peek, peek opens to half, half to full, full drops back to peek. */
export function nextDetent(detent: Detent): Detent {
  return detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek';
}

/** Opening something lifts a hidden or peeking sheet to half, so its page shows. */
export function liftDetent(detent: Detent): Detent {
  return detent === 'hidden' || detent === 'peek' ? 'half' : detent;
}
