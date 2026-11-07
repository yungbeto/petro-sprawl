// The menu footer's easter egg, and the 404 page's tank: crude sloshing at the bottom of the page, as if the footer held it. The
// surface moves by src/lib/slosh.ts; this draws it and feeds it the pointer and the scroll. It runs only
// while on screen and the tab is visible, and lies still, gently tilted, under reduced motion.

import { useEffect, useRef, type RefObject } from 'react';
import { OIL_SLOSH } from '../lib/config';
import { createSurface, lurch, resizeSurface, stepSurface, stir, type SloshParams, type Surface } from '../lib/slosh';

/** A tank's settings: the physics, plus the band it's drawn in and how it starts. `OIL_SLOSH` is the menu's. */
export interface OilTank extends SloshParams {
  canvasPx: number;
  warmUpS: number;
  maxFrameS: number;
  lurch: { gain: number; maxImpulse: number };
}

interface OilSloshProps {
  /** The element whose pointer movement stirs the oil: the footer. */
  stirTarget: RefObject<HTMLElement | null>;
  /** The element whose scrolling jolts it: the menu's scroller. */
  scrollTarget?: RefObject<HTMLElement | null>;
  /** Redraws in the new colours when it changes. */
  theme: string;
  /** The tank: the menu footer's puddle unless given (the 404 page's is deeper). */
  tank?: OilTank;
  className?: string;
}

const token = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim() || '#000';

export function OilSlosh({ stirTarget, scrollTarget, theme, tank = OIL_SLOSH, className = 'menu__oil' }: OilSloshProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const height = tank.canvasPx;
    let width = 0;
    let ratio = 1;
    let surface: Surface = createSurface(1, tank);
    let clock = 0;
    const colours = {
      oil: token(canvas, '--oil'),
      deep: token(canvas, '--oil-deep'),
      sheen: token(canvas, '--oil-sheen'),
      slick: [token(canvas, '--oil-slick-1'), token(canvas, '--oil-slick-2'), token(canvas, '--oil-slick-3')],
    };

    // A smooth line through the columns: quadratic curves between their midpoints.
    const tracePath = () => {
      const { h } = surface;
      const step = width / (h.length - 1);
      const y = (i: number) => height - h[i]!;
      context.moveTo(0, y(0));
      for (let i = 1; i < h.length - 1; i++) {
        context.quadraticCurveTo(i * step, y(i), (i + 0.5) * step, (y(i) + y(i + 1)) / 2);
      }
      context.lineTo(width, y(h.length - 1));
    };

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const top = height - Math.max(...surface.h);
      const body = context.createLinearGradient(0, top, 0, height);
      body.addColorStop(0, colours.oil);
      body.addColorStop(1, colours.deep);
      context.beginPath();
      tracePath();
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fillStyle = body;
      context.fill();
      // The slick: a band of colour just under the surface, inside the oil, drifting with it.
      context.save();
      context.clip();
      const slick = context.createLinearGradient(0, 0, width, 0);
      colours.slick.forEach((c, i) => slick.addColorStop(i / (colours.slick.length - 1), c));
      context.beginPath();
      tracePath();
      context.lineWidth = 10;
      context.strokeStyle = slick;
      context.stroke();
      context.restore();
      context.beginPath();
      tracePath();
      context.lineWidth = 1;
      context.strokeStyle = colours.sheen;
      context.stroke();
    };

    const fit = () => {
      const next = canvas.clientWidth;
      if (!next) return;
      ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(next * ratio);
      canvas.height = Math.round(height * ratio);
      if (width) surface = resizeSurface(surface, next, tank);
      else {
        // Opened mid-swing, not flat: run the first seconds before the first frame.
        surface = createSurface(next, tank);
        for (; clock < tank.warmUpS; clock += 1 / 60) stepSurface(surface, clock, 1 / 60, tank);
      }
      width = next;
      draw();
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let visible = false;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(tank.maxFrameS, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      stepSurface(surface, clock, dt, tank);
      draw();
      raf = requestAnimationFrame(tick);
    };
    const running = () => visible && !reduce.matches && document.visibilityState === 'visible';
    const update = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (running()) raf = requestAnimationFrame(tick);
      else if (reduce.matches) {
        // Still, with the oil settled a little to one side, as it would after the last rock.
        surface = createSurface(width || 1, tank);
        surface.h.forEach((_, i) => (surface.h[i] = tank.depthPx + (i / (surface.h.length - 1) - 0.5) * 8));
        draw();
      }
    };

    // The pointer stirs it, anywhere over the footer.
    let lastX: number | null = null;
    let lastT = 0;
    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX - canvas.getBoundingClientRect().left;
      if (lastX !== null && e.timeStamp > lastT && running()) {
        stir(surface, x, ((x - lastX) / (e.timeStamp - lastT)) * 1000, tank);
      }
      lastX = x;
      lastT = e.timeStamp;
    };
    const onPointerLeave = () => (lastX = null);

    // Scrolling down onto the footer jolts the tank, as a sudden stop would.
    const scroller = scrollTarget?.current;
    let lastTop = scroller?.scrollTop ?? 0;
    let lastScrollT = 0;
    const onScroll = (e: Event) => {
      if (!scroller) return;
      const dy = scroller.scrollTop - lastTop;
      const dt = e.timeStamp - lastScrollT;
      lastTop = scroller.scrollTop;
      lastScrollT = e.timeStamp;
      if (!running() || dt <= 0 || dt > 200) return;
      const { gain, maxImpulse } = tank.lurch;
      lurch(surface, Math.max(-maxImpulse, Math.min(maxImpulse, (dy / dt) * 1000 * gain)));
    };

    const resize = new ResizeObserver(fit);
    resize.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      update();
    });
    seen.observe(canvas);
    const target = stirTarget.current;
    target?.addEventListener('pointermove', onPointerMove);
    target?.addEventListener('pointerleave', onPointerLeave);
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    reduce.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    fit();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      target?.removeEventListener('pointermove', onPointerMove);
      target?.removeEventListener('pointerleave', onPointerLeave);
      scroller?.removeEventListener('scroll', onScroll);
      reduce.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [stirTarget, scrollTarget, theme, tank]);

  return <canvas ref={canvasRef} className={className} style={{ height: tank.canvasPx }} aria-hidden="true" />;
}
