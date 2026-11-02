// The app's LED dot globe, turned by the video's frame rather than a timer, so every render matches.

import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { GLOBE } from '../../src/lib/config';
import { globeFrame, globeSvg } from '../../src/lib/globe';
import { GLOBE_LAND } from '../../src/lib/globeLand';

const DOTS = GLOBE.hero.dots;

export const Globe = ({ size, startLon = 30 }: { readonly size: number; readonly startLon?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Steps GLOBE.fps times a second, like the header mark, a turn every 24 seconds.
  const step = Math.floor((frame / fps) * GLOBE.fps);
  const lon = startLon + (step / GLOBE.fps) * (360 / GLOBE.secondsPerTurn);
  const svg = useMemo(
    () =>
      globeSvg({
        frame: globeFrame({ mask: GLOBE_LAND, dots: DOTS, lon, tilt: GLOBE.tilt }),
        dots: DOTS,
        fill: GLOBE.hero.fill,
        oceanOpacity: GLOBE.og.oceanOpacity,
        themed: false,
      }),
    [lon],
  );
  return <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
};
