import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { MOBILE } from '../lib/config';
import { nextDetent, sheetHeights, snapDetent, type Detent, type SheetHeights } from '../lib/sheet';

/** True below the phone breakpoint, and kept in step as the window resizes. */
export function useIsPhone(): boolean {
  const query = `(max-width: ${MOBILE.maxWidthPx}px)`;
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setPhone(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return phone;
}

export interface Sheet {
  detent: Detent;
  setDetent: (next: Detent | ((current: Detent) => Detent)) => void;
  /** The handle's tap: the next height up, or back to peek from full. */
  cycle: () => void;
  /** Starts a drag from the handle or the panel's top bar; a press that doesn't move stays a click. */
  onDragStart: (event: ReactPointerEvent) => void;
  /** The same on the page itself, below full; at full the page scrolls and a pull from its top drags. */
  onContentPointerDown: (event: ReactPointerEvent) => void;
  /** What the map keeps clear when it frames something: the search bar and chips, and the sheet with the tab bar. */
  insets: { top: number; bottom: number } | null;
}

/**
 * The phone layout's bottom sheet. Its height lives in `--sheet-h` on the app element, written
 * straight to the DOM while dragging so the app doesn't re-render every frame; the detent is state.
 */
export function useSheet(enabled: boolean, appRef: RefObject<HTMLElement | null>): Sheet {
  const [detent, setDetent] = useState<Detent>('peek');
  const [layout, setLayout] = useState<{ heights: SheetHeights; headerBottom: number; barTop: number } | null>(null);
  const dragging = useRef(false);

  // Measure the search bar and the tab bar, now and whenever the window changes size.
  useLayoutEffect(() => {
    const app = appRef.current;
    if (!enabled || !app) {
      setLayout(null);
      return;
    }
    const measure = () => {
      const header = app.querySelector('.app-header')?.getBoundingClientRect();
      const bar = app.querySelector('.rail')?.getBoundingClientRect();
      if (!header || !bar) return;
      const box = { headerBottom: header.bottom, barTop: bar.top };
      setLayout({ ...box, heights: sheetHeights(box) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [enabled, appRef]);

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) return;
    if (!layout) {
      app.style.removeProperty('--sheet-h');
      return;
    }
    app.style.setProperty('--sheet-h', `${layout.heights[detent]}px`);
    // Below full the page can't scroll, so it starts from its top again.
    if (detent !== 'full') app.querySelector('.panel__body')?.scrollTo({ top: 0 });
  }, [layout, detent, appRef]);

  /** One drag of the sheet: it follows past the tap threshold, then snaps where it's let go. */
  const beginDrag = useCallback(
    (startY: number, startTime: number) => {
      const app = appRef.current;
      if (!layout || !app) return null;
      const { heights } = layout;
      const startHeight = heights[detent];
      let height = startHeight;
      let last = { y: startY, t: startTime };
      let velocity = 0;
      dragging.current = false;
      return {
        /** Follows the finger or pointer; true once it has moved far enough to be a drag. */
        move(y: number, t: number): boolean {
          const dy = startY - y;
          if (!dragging.current) {
            if (Math.abs(dy) < MOBILE.dragThresholdPx) return false;
            dragging.current = true;
            app.dataset.sheetDragging = 'true';
          }
          height = Math.min(heights.full, Math.max(heights.hidden, startHeight + dy));
          app.style.setProperty('--sheet-h', `${height}px`);
          if (t > last.t) velocity = (last.y - y) / (t - last.t);
          last = { y, t };
          return true;
        },
        end() {
          if (!dragging.current) return;
          delete app.dataset.sheetDragging;
          const next = snapDetent(heights, height, velocity);
          setDetent(next);
          // Put the height back even when the detent is unchanged, so the sheet settles.
          app.style.setProperty('--sheet-h', `${heights[next]}px`);
          // A drag that ends over a button isn't a click on it. The click, if any, follows this
          // pointerup in the same task; the guard is gone by the next one.
          const swallow = (e: MouseEvent) => e.stopPropagation();
          window.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
          dragging.current = false;
        },
      };
    },
    [layout, detent, appRef],
  );

  const onDragStart = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      const drag = beginDrag(event.clientY, event.timeStamp);
      if (!drag) return;
      const move = (e: PointerEvent) => drag.move(e.clientY, e.timeStamp);
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        drag.end();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [beginDrag],
  );

  // Below full the page doesn't scroll (CSS turns that off), so a drag on it moves the sheet.
  const onContentPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (detent !== 'full') onDragStart(event);
    },
    [detent, onDragStart],
  );

  // At full the page scrolls. Pulling down from its top hands the gesture to the sheet, as in map
  // apps; touch only, since a mouse has the wheel and the handle.
  useEffect(() => {
    const body = appRef.current?.querySelector<HTMLElement>('.panel__body');
    if (!layout || detent !== 'full' || !body) return;
    let drag: ReturnType<typeof beginDrag> = null;
    let startY = 0;
    const start = (e: TouchEvent) => {
      const touch = e.touches[0];
      drag = touch && e.touches.length === 1 && body.scrollTop <= 0 ? beginDrag(touch.clientY, e.timeStamp) : null;
      startY = touch?.clientY ?? 0;
    };
    const move = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!drag || !touch) return;
      // Pushing up scrolls the page as usual; only a pull down from the top is the sheet's.
      if (touch.clientY < startY && !dragging.current) {
        drag = null;
        return;
      }
      e.preventDefault();
      drag.move(touch.clientY, e.timeStamp);
    };
    const end = () => {
      drag?.end();
      drag = null;
    };
    body.addEventListener('touchstart', start, { passive: true });
    body.addEventListener('touchmove', move, { passive: false });
    body.addEventListener('touchend', end);
    body.addEventListener('touchcancel', end);
    return () => {
      body.removeEventListener('touchstart', start);
      body.removeEventListener('touchmove', move);
      body.removeEventListener('touchend', end);
      body.removeEventListener('touchcancel', end);
    };
  }, [layout, detent, beginDrag, appRef]);

  const cycle = useCallback(() => setDetent((d) => nextDetent(d)), []);

  const insets = layout
    ? { top: Math.round(layout.headerBottom + MOBILE.chipsPx), bottom: Math.round(window.innerHeight - layout.barTop + layout.heights[detent]) }
    : null;

  return { detent, setDetent, cycle, onDragStart, onContentPointerDown, insets };
}
