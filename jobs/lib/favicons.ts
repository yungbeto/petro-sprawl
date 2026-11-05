// Publisher favicons for "In the news" (added 2026-11-05). The news scan fetches each publisher site's icon
// once and saves it under public/favicons/, so the page serves it from its own origin and a reader's browser
// never calls the publisher. Only raster images whose bytes say what they are: an SVG served from our own
// origin could run script if opened directly, so SVG icons are skipped. The parsing here is pure (tested in
// tests/favicons.test.ts); `fetchFavicon` does the network.

import { NEWS } from '../../src/lib/config';
import { daysBetween } from './claims';

export type IconType = 'png' | 'ico' | 'jpg' | 'gif' | 'webp';

/** What's known about one publisher site's icon: the saved file, or none, and when that was last tried. */
export interface FaviconState {
  file: string | null;
  checkedAt: string;
}

/** A publisher site as a file name: lowercase host without "www.", or null when it isn't a plain host. */
export function siteKey(domain: string): string | null {
  const host = domain.trim().toLowerCase().replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The image type from the file's first bytes, or null for anything else (HTML error pages, SVG). */
export function imageType(bytes: Uint8Array): IconType | null {
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (starts(0x00, 0x00, 0x01, 0x00)) return 'ico';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  return null;
}

/**
 * The icons a home page declares, best first, then /favicon.ico: `rel="icon"` (and "shortcut icon") nearest
 * 32 px, then apple-touch-icon, which is larger but always raster. SVG links are left out.
 */
export function iconCandidates(html: string, pageUrl: string): string[] {
  const links: { href: string; rank: number }[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]?.trim();
    const rel = attr('rel')?.toLowerCase().split(/\s+/) ?? [];
    const href = attr('href');
    if (!href || /^data:/i.test(href)) continue;
    if (/\.svg(\?|#|$)/i.test(href) || /svg/i.test(attr('type') ?? '')) continue;
    const size = Number(attr('sizes')?.match(/^(\d+)x\d+/i)?.[1] ?? 0);
    if (rel.includes('icon')) links.push({ href, rank: size ? Math.abs(size - 32) : 16 });
    else if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) links.push({ href, rank: 1000 + size });
  }
  const urls = links
    .sort((a, b) => a.rank - b.rank)
    .flatMap(({ href }) => {
      try {
        const u = new URL(href, pageUrl);
        return u.protocol === 'https:' || u.protocol === 'http:' ? [u.href] : [];
      } catch {
        return [];
      }
    });
  const fallback = new URL('/favicon.ico', pageUrl).href;
  return [...new Set([...urls, fallback])];
}

/** The sites to look up this run: never tried, or tried without an icon more than `NEWS.faviconRetryDays` ago. */
export function sitesToFetch(sites: Iterable<string>, state: Record<string, FaviconState>, today: string): string[] {
  const out = new Set<string>();
  for (const site of sites) {
    const known = state[site];
    if (!known || (!known.file && daysBetween(known.checkedAt, today) > NEWS.faviconRetryDays)) out.add(site);
  }
  return [...out].sort().slice(0, NEWS.faviconsPerRun);
}

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; petro-sprawl news scan)' };

async function get(url: string, accept: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: { ...UA, accept }, redirect: 'follow', signal: AbortSignal.timeout(NEWS.faviconTimeoutMs) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** The site's icon as bytes and type, or null: the home page's declared icons first, then /favicon.ico. */
export async function fetchFavicon(site: string): Promise<{ bytes: Uint8Array; type: IconType } | null> {
  const home = `https://${site}/`;
  const page = await get(home, 'text/html');
  const html = page && /html/i.test(page.headers.get('content-type') ?? '') ? (await page.text()).slice(0, 200_000) : '';
  for (const url of iconCandidates(html, page?.url || home)) {
    const res = await get(url, 'image/*');
    if (!res) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > NEWS.faviconMaxBytes) continue;
    const type = imageType(bytes);
    if (type) return { bytes, type };
  }
  return null;
}
