/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Link previews: the card image for a page in the app, 1200 x 630, drawn on request and cached by the CDN.
// The page's kind and name, a fact or two with their source, and the header globe turned to the place,
// with the place lit. A link to Home, or to nothing the index knows, gets Home's card (public/og.png).

import { ImageResponse } from '@vercel/og';
import { GLOBE, SITE } from '../src/lib/config';
import { globeFrame, globeSvg } from '../src/lib/globe';
import { withRing } from '../src/lib/share';
import { GLOBE_LAND } from '../src/lib/globeLand';
import { findCard, SHARE_CACHE } from './share';

const COLORS = { bg: '#f4f4f2', text: '#17191c', muted: '#5f646b' };
const MAX_FACT = 140;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' };
let fonts: Promise<Font[]> | null = null;

/** Inter and IBM Plex Mono as TrueType: Google Fonts sends TTF to a client that doesn't name a browser. */
async function googleFont(family: string, weight: 400 | 500): Promise<Font | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!src) return null;
    return { name: family, data: await (await fetch(src)).arrayBuffer(), weight, style: 'normal' };
  } catch {
    return null;
  }
}

function loadFonts(): Promise<Font[]> {
  fonts ??= Promise.all([googleFont('Inter', 400), googleFont('Inter', 500), googleFont('IBM Plex Mono', 400)]).then((list) => {
    const found = list.filter((f): f is Font => f !== null);
    // Try again next time if any failed; the renderer's own font stands in meanwhile.
    if (found.length < list.length) fonts = null;
    return found;
  });
  return fonts;
}

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const clip = (text: string) => (text.length > MAX_FACT ? `${text.slice(0, MAX_FACT - 1).trimEnd()}…` : text);
const titleSize = (title: string) => (title.length <= 16 ? 84 : title.length <= 26 ? 68 : title.length <= 44 ? 54 : 44);

/** The small mark in the corner, as in the header: the favicon's frame. */
const MARK = (() => {
  const { dots, lon, fill, oceanOpacity } = GLOBE.favicon;
  return svgUri(globeSvg({ frame: globeFrame({ mask: GLOBE_LAND, dots, lon, tilt: GLOBE.tilt }), dots, fill, oceanOpacity, themed: false }));
})();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const found = await findCard(url);
  if (!found) return Response.redirect(new URL('/og.png', url.origin), 302);
  const { card } = found;
  const { dots, fill, px, focusLandOpacity, focusOceanOpacity } = GLOBE.og;
  const [lon, lat] = card.center;
  const frame = globeFrame({ mask: GLOBE_LAND, dots, lon, tilt: Math.max(-60, Math.min(60, lat)), focus: new Set(withRing(card.focus, card.center)) });
  const lit = card.focus.length > 0;
  const globe = svgUri(
    globeSvg({ frame, dots, fill, oceanOpacity: lit ? focusOceanOpacity : GLOBE.og.oceanOpacity, landOpacity: lit ? focusLandOpacity : 1, themed: false }),
  );
  const loaded = await loadFonts();

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', background: COLORS.bg, color: COLORS.text, fontFamily: 'Inter' }}>
        <div style={{ position: 'absolute', left: 80, top: 56, bottom: 120, width: 560, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 28, color: COLORS.muted }}>{card.kicker}</div>
          <div style={{ fontSize: titleSize(card.title), fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05, marginTop: 14 }}>{card.title}</div>
          {card.facts.slice(0, 2).map((fact) => (
            <div key={fact} style={{ fontSize: 28, lineHeight: 1.35, marginTop: 20, letterSpacing: '-0.01em' }}>
              {clip(fact)}
            </div>
          ))}
          {card.source && <div style={{ fontSize: 20, color: COLORS.muted, marginTop: 24, fontFamily: 'IBM Plex Mono' }}>{clip(card.source)}</div>}
        </div>
        <div style={{ position: 'absolute', left: 80, bottom: 52, display: 'flex', alignItems: 'center' }}>
          <img src={MARK} width={28} height={28} />
          <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.03em', color: COLORS.muted, marginLeft: 14 }}>
            {SITE.name}
          </div>
          <div style={{ fontSize: 24, letterSpacing: '-0.01em', color: COLORS.muted, marginLeft: 8 }}>{`· ${SITE.tagline}`}</div>
        </div>
        <img src={globe} width={px} height={px} style={{ position: 'absolute', right: 72, top: (630 - px) / 2 }} />
      </div>
    ),
    { width: 1200, height: 630, fonts: loaded, headers: { 'cache-control': SHARE_CACHE } },
  );
}
