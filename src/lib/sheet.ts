// The phone layout's bottom sheet: its three heights and where a drag snaps to. Pure.

import { MOBILE } from './config';

export const DETENTS = ['peek', 'half', 'full'] as const;
export type Detent = (typeof DETENTS)[number];

export type SheetHeights = Record<Detent, number>;

/**
 * Heights for the room between the search bar's bottom and the tab bar's top, in px. Full reaches up
 * to just under the search bar; half is a share of the space above the tab bar; peek never exceeds either.
 */
export function sheetHeights({ headerBottom, barTop }: { headerBottom: number; barTop: number }): SheetHeights {
  const full = Math.max(0, Math.round(barTop - headerBottom - MOBILE.gapBelowHeaderPx));
  const peek = Math.min(MOBILE.peekPx, full);
  const half = Math.min(full, Math.max(peek, Math.round(barTop * MOBILE.halfShare)));
  return { peek, half, full };
}

/** The detent nearest where the sheet would come to rest, carried on by a flick's speed (px per ms, up positive). */
export function snapDetent(heights: SheetHeights, height: number, velocity: number): Detent {
  const resting = height + velocity * MOBILE.flickMs;
  return DETENTS.reduce((best, d) => (Math.abs(heights[d] - resting) < Math.abs(heights[best] - resting) ? d : best), 'peek' as Detent);
}

/** A tap on the handle: peek opens to half, half to full, full drops back to peek. */
export function nextDetent(detent: Detent): Detent {
  return detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek';
}
