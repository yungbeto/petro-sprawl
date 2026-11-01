import { useEffect, useRef } from 'react';
import { GLOBE } from '../lib/config';
import { DOT, globeFrame } from '../lib/globe';
import { GLOBE_LAND } from '../lib/globeLand';

/** Where the globe starts, and rests when motion is reduced: Africa and Europe. */
const STILL_LON = 10;
const OCEAN_ALPHA = 0.22;

/**
 * The header mark: a turning globe on a grid of dots, lit for land and dim for ocean, stepping like an
 * LED panel. Dots take the element's `color`; the disc behind them is the CSS background.
 * `theme` is only there to redraw a still globe when the colors change.
 */
export function GlobeMark({ theme }: { theme: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const px = GLOBE.size * ratio;
    canvas.width = px;
    canvas.height = px;
    const pitch = px / GLOBE.dots;
    const dot = Math.max(1, Math.round(GLOBE.dotPx * ratio));
    const inset = Math.floor((pitch - dot) / 2);

    const draw = (lon: number) => {
      const frame = globeFrame({ mask: GLOBE_LAND, dots: GLOBE.dots, lon, tilt: GLOBE.tilt });
      context.clearRect(0, 0, px, px);
      context.fillStyle = getComputedStyle(canvas).color;
      for (const [level, alpha] of [
        [DOT.ocean, OCEAN_ALPHA],
        [DOT.land, 1],
      ] as const) {
        context.globalAlpha = alpha;
        frame.forEach((d, i) => {
          if (d !== level) return;
          const x = Math.round((i % GLOBE.dots) * pitch) + inset;
          const y = Math.round(Math.floor(i / GLOBE.dots) * pitch) + inset;
          context.fillRect(x, y, dot, dot);
        });
      }
      context.globalAlpha = 1;
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let step = -1;
    const stepsPerTurn = GLOBE.secondsPerTurn * GLOBE.fps;
    const tick = (now: number) => {
      const next = Math.floor((now / 1000) * GLOBE.fps) % stepsPerTurn;
      // Hidden on phones (no offset parent): keep the clock, skip the drawing.
      if (next !== step && canvas.offsetParent) {
        step = next;
        // Eastward, as the Earth turns: the longitude at the centre falls.
        draw(STILL_LON - (step / stepsPerTurn) * 360);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      step = -1;
      if (reduce.matches) draw(STILL_LON);
      else raf = requestAnimationFrame(tick);
    };
    start();
    reduce.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      reduce.removeEventListener('change', start);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="brand-mark" aria-hidden="true" />;
}
