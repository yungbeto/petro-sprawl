// The demo video: a title, the app's footage (npm run record:demo) framed on a backdrop with a caption for
// each scene and zooms on the figures, then the address. Laid out for any size: 16:9 for the feed, square
// for phones. Footage times come from demo/beats.json, so a new recording keeps its cuts.

import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono';
import { Video } from '@remotion/media';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SITE } from '../../src/lib/config';
import beats from '../../demo/beats.json';
import { Globe } from './Globe';

const { fontFamily: sans } = loadInter('normal', { weights: ['400', '500'], subsets: ['latin'] });
const { fontFamily: mono } = loadMono('normal', { weights: ['400'], subsets: ['latin'] });

// The app's light theme.
const COLORS = { bg: '#f4f4f2', backdrop: '#e8e8e4', text: '#17191c', muted: '#5f646b' };

/** How much faster than filmed the footage plays: the camera's flights read as slow at real speed. */
export const RATE = 1.35;
/** Footage starts a moment before Home's beat. */
const FOOTAGE_START = Math.max(0, beats.scenes[0]!.at - 0.2);
const INTRO_S = 2.6;
const OUTRO_S = 3.6;
const FADE_S = 0.5;

/** Each scene's caption, by its beat id. */
const CAPTIONS: Record<string, string> = {
  home: "A live map of the world's oil and gas",
  chokepoints: 'Tanker traffic through each strait, against its five-year average',
  pipeline: 'Measured pipeline flows, with a cited source for every status',
  basin: 'Oil and gas basins, and the pipelines that cross them',
  zip: 'Type a US ZIP code to see where your fuel comes from',
};

/** Output seconds for a footage time. */
const outputAt = (t: number) => (t - FOOTAGE_START) / RATE;

export const durationInFrames = (fps: number) =>
  Math.ceil((INTRO_S + outputAt(beats.duration) + OUTRO_S - 2 * FADE_S) * fps);

export const Demo = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: sans, color: COLORS.text }}>
      <TransitionSeries name="Scenes">
        <TransitionSeries.Sequence name="Title" durationInFrames={Math.round(INTRO_S * fps)}>
          <Card title={SITE.name} line={SITE.tagline} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(FADE_S * fps) })} />
        <TransitionSeries.Sequence name="Tour" durationInFrames={Math.ceil(outputAt(beats.duration) * fps)}>
          <Tour />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: Math.round(FADE_S * fps) })} />
        <TransitionSeries.Sequence name="Address" durationInFrames={Math.round(OUTRO_S * fps)}>
          <Card title="petrosprawl.fyi" titleFont={mono} startLon={50} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

/** Output frames for the footage alone. */
export const footageDurationInFrames = (fps: number) => Math.ceil(outputAt(beats.duration) * fps);

/** The footage alone, full frame: the same speed and zooms, no cards, captions or backdrop. */
export const UiOnly = () => {
  const { fps, width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: 'hidden' }}>
      <Zoom width={width} height={height}>
        <Video name="Footage" src={staticFile('footage.mp4')} trimBefore={Math.round(FOOTAGE_START * fps)} playbackRate={RATE} muted style={{ width, height }} />
      </Zoom>
    </AbsoluteFill>
  );
};

/** Where the footage sits: wide frames put the caption above it, square ones get the address below too. */
function useLayout() {
  const { width, height } = useVideoConfig();
  const wide = width / height > 1.4;
  const footageW = wide ? width * 0.8 : width - 72;
  const footageH = (footageW * 9) / 16;
  const bottom = wide ? height * 0.045 : height * 0.13;
  const top = height - bottom - footageH;
  return { width, height, wide, footageW, footageH, top, bottom, left: (width - footageW) / 2 };
}

const Card = ({ title, line, titleFont, startLon }: { readonly title: string; readonly line?: string; readonly titleFont?: string; readonly startLon?: number }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const rise = (delay: number) => ({
    opacity: interpolate(frame, [delay * fps, (delay + 0.6) * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    translate: interpolate(frame, [delay * fps, (delay + 0.6) * fps], ['0px 16px', '0px 0px'], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 40 * unit }}>
      <div style={rise(0)}>
        <Globe size={300 * unit} startLon={startLon} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * unit }}>
        <div style={{ ...rise(0.15), fontFamily: titleFont ?? sans, fontSize: (titleFont ? 76 : 104) * unit, fontWeight: titleFont ? 400 : 500, letterSpacing: titleFont ? '-0.02em' : '-0.045em', lineHeight: 1 }}>
          {title}
        </div>
        {line && <div style={{ ...rise(0.3), fontSize: 44 * unit, color: COLORS.muted, letterSpacing: '-0.01em' }}>{line}</div>}
      </div>
    </AbsoluteFill>
  );
};

const Tour = () => {
  const { fps } = useVideoConfig();
  const { wide, width, height, footageW, footageH, top, left, bottom } = useLayout();
  const scenes = beats.scenes.map((s, i) => ({ ...s, end: beats.scenes[i + 1]?.at ?? beats.duration }));
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.backdrop }}>
      {scenes.map((s) => (
        <Sequence
          key={s.id}
          name={`Caption: ${s.id}`}
          from={Math.round(Math.max(0, outputAt(s.at)) * fps)}
          durationInFrames={Math.round((outputAt(s.end) - Math.max(0, outputAt(s.at))) * fps)}
          layout="none"
        >
          <Caption text={CAPTIONS[s.id] ?? ''} height={top} width={width} wide={wide} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: footageW,
          height: footageH,
          overflow: 'hidden',
          borderRadius: 18 * (footageW / 1536),
          boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          backgroundColor: COLORS.bg,
        }}
      >
        <Zoom width={footageW} height={footageH}>
          <Video name="Footage" src={staticFile('footage.mp4')} trimBefore={Math.round(FOOTAGE_START * fps)} playbackRate={RATE} muted style={{ width: footageW, height: footageH }} />
        </Zoom>
      </div>
      {!wide && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bottom, display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: mono, fontSize: 34 * (height / 1080), color: COLORS.muted }}>
          petrosprawl.fyi
        </div>
      )}
    </AbsoluteFill>
  );
};

const Caption = ({ text, height, width, wide }: { readonly text: string; readonly height: number; readonly width: number; readonly wide: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const unit = width / (wide ? 1920 : 1080);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: `0 ${80 * unit}px`,
        textAlign: 'center',
        textWrap: 'balance',
        fontSize: (wide ? 52 : 60) * unit,
        fontWeight: 500,
        letterSpacing: '-0.025em',
        lineHeight: 1.15,
        opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        translate: interpolate(frame, [0, 0.5 * fps], ['0px 14px', '0px 0px'], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {text}
    </div>
  );
};

/** Moves in on each zoom's part of the screen, and back out, eased. Rects are in the recording's CSS pixels. */
const Zoom = ({ width, height, children }: { readonly width: number; readonly height: number; readonly children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = FOOTAGE_START + (frame / fps) * RATE;
  const k = width / beats.viewport.width;
  let scale = 1;
  let x = 0;
  let y = 0;
  for (const z of beats.zooms) {
    const ramp = 0.7 * RATE;
    const p = interpolate(t, [z.from - ramp, z.from, z.to, z.to + ramp], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.65, 0, 0.35, 1),
    });
    if (p === 0) continue;
    const r = { x: z.rect.x * k, y: z.rect.y * k, w: z.rect.width * k, h: z.rect.height * k };
    const target = Math.min(2.2, (0.86 * width) / r.w, (0.86 * height) / r.h);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    // Centre the rect, without showing past the footage's edges.
    const tx = Math.min(0, Math.max(width - width * target, width / 2 - cx * target));
    const ty = Math.min(0, Math.max(height - height * target, height / 2 - cy * target));
    scale = 1 + (target - 1) * p;
    x = tx * p;
    y = ty * p;
  }
  return <div style={{ width, height, transformOrigin: '0 0', translate: `${x}px ${y}px`, scale }}>{children}</div>;
};
