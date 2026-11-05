import { z } from 'zod';
import type { Evidence } from '../../src/types';

/** What Claude returns for one asset. `found: false` when no newer dated source turned up. */
export const claimDraftSchema = z.object({
  found: z.boolean(),
  status: z.enum(['operating', 'reduced', 'offline', 'idle', 'unknown']),
  sourceType: z.enum(['operator', 'regulator', 'government', 'press']),
  publisher: z.string(),
  url: z.string(),
  quote: z.string(),
  observedAt: z.string(),
  statement: z.string(),
});
export type ClaimDraft = z.infer<typeof claimDraftSchema>;

export interface CuratedRecord {
  id: string;
  evidence: Evidence[];
}

export interface StaleAsset {
  /** "pipeline/<id>", "lng/<id>" or "terminal/<id>". */
  ref: string;
  name: string;
  /** The newest cited claim; null for an asset we have no claim for yet. */
  latest: Evidence | null;
}

export const CLAIMED: Evidence['sourceType'][] = ['operator', 'regulator', 'government', 'press'];

/** The newest cited claim, ignoring dataset and measured entries. */
export function latestClaim(evidence: Evidence[]): Evidence | null {
  return evidence.filter((e) => CLAIMED.includes(e.sourceType)).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Assets whose newest cited claim is older than `staleDays`, oldest first. Assets without claims are left alone. */
export function staleAssets(
  assets: { ref: string; name: string; evidence: Evidence[] }[],
  { today, staleDays, skip }: { today: string; staleDays: number; skip: readonly string[] },
): (StaleAsset & { latest: Evidence })[] {
  const stale: (StaleAsset & { latest: Evidence })[] = [];
  for (const a of assets) {
    const latest = latestClaim(a.evidence);
    if (latest && !skip.includes(a.ref) && daysBetween(latest.observedAt, today) > staleDays) stale.push({ ref: a.ref, name: a.name, latest });
  }
  return stale.sort((a, b) => a.latest.observedAt.localeCompare(b.latest.observedAt));
}

/** Assets with no cited claim at all, so the refresh can look for a first one. */
export function unclaimedAssets(
  assets: { ref: string; name: string; evidence: Evidence[] }[],
  { skip }: { skip: readonly string[] },
): StaleAsset[] {
  return assets.filter((a) => !latestClaim(a.evidence) && !skip.includes(a.ref)).map((a) => ({ ref: a.ref, name: a.name, latest: null }));
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

/** Visible text of an HTML page, near enough to find a quote in it. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters and digits only, lowercased, so quotes survive curly quotes, dashes and line breaks. */
export function matchKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function quoteOnPage(quote: string, pageText: string): boolean {
  const key = matchKey(quote);
  return key.length > 0 && ` ${matchKey(pageText)} `.includes(` ${key} `);
}

const DATE_PATTERNS = [
  /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:article:published_time|datePublished|date|pubdate|publish-date|parsely-pub-date|sailthru\.date|dc\.date|dcterms\.date)["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|og:article:published_time|datePublished|date|pubdate|publish-date|parsely-pub-date|sailthru\.date|dc\.date|dcterms\.date)["']/i,
  /"datePublished"\s*:\s*"([^"]+)"/i,
];

/** Publication date (YYYY-MM-DD) from the page's own metadata, or null. Never the date a search engine reports. */
export function pagePublishedAt(html: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const value = html.match(pattern)?.[1];
    const date = value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (date && !Number.isNaN(Date.parse(date))) return date;
  }
  return null;
}

/** Ignores scheme, "www.", trailing slashes, query and fragment, so a cited link matches a draft. */
export function urlKey(url: string): string {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
}

/** Every http(s) link in the curated files' text: evidence, capacity and owner sources alike. */
export function citedUrls(texts: string[]): Set<string> {
  const keys = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(/https?:\/\/[^\s"]+/g)) keys.add(urlKey(m[0]));
  return keys;
}

export function isTrusted(url: string, domains: readonly string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface Page {
  text: string;
  publishedAt: string | null;
}

/**
 * Why a draft can't be used; empty when it passes. The checks don't trust anything the model says
 * about the page: the quote must be on it and the date must come from its metadata.
 */
export function verifyDraft(
  draft: ClaimDraft,
  page: Page,
  latest: Evidence | null,
  {
    today,
    cited,
    quoteWords,
    firstClaimDays,
  }: { today: string; cited: Set<string>; quoteWords: { min: number; max: number }; firstClaimDays: number },
): string[] {
  const problems: string[] = [];
  const words = matchKey(draft.quote).split(' ').filter(Boolean).length;
  if (words < quoteWords.min || words > quoteWords.max) problems.push(`quote is ${words} words`);
  else if (!quoteOnPage(draft.quote, page.text)) problems.push('quote not found on the page');
  if (cited.has(urlKey(draft.url))) problems.push('source already cited');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.observedAt) || Number.isNaN(Date.parse(draft.observedAt))) {
    problems.push(`date "${draft.observedAt}" isn't a date`);
  } else {
    if (draft.observedAt > today) problems.push('date is in the future');
    if (latest && draft.observedAt <= latest.observedAt) problems.push(`not newer than the current claim (${latest.observedAt})`);
    if (!latest && daysBetween(draft.observedAt, today) > firstClaimDays) problems.push(`older than ${firstClaimDays} days`);
    if (!page.publishedAt) problems.push('page has no publication date');
    else if (draft.observedAt > page.publishedAt) problems.push(`refers to ${draft.observedAt}, after the page was published (${page.publishedAt})`);
  }
  if (!draft.statement.trim()) problems.push('no statement');
  return problems;
}

/** Names an asset goes by: the parts of its display name ("Arab Gas Pipeline · Egypt–Jordan (Arish–Aqaba)") and its aliases. */
export function assetTerms(name: string, aliases: readonly string[]): string[] {
  const parts = name.split(/\s*[·()]\s*/).map((p) => p.trim());
  return [...new Set([...parts, ...aliases].filter((t) => matchKey(t).length >= 3))];
}

/**
 * Commit without review only when the quote names the asset and the status is the one we already show.
 * A first claim for an asset always goes to review. A quote that never names the asset is where a model
 * most often attaches a true sentence to the wrong pipeline. The domain no longer decides (2026-11-05): a
 * confirmation from a domain off the trusted list is committed marked unreviewed (`claimUnreviewed`).
 */
export function needsReview(
  draft: ClaimDraft,
  latest: Evidence | null,
  { terms }: { terms: readonly string[] },
): string | null {
  if (!latest) return 'first claim for this asset';
  if (draft.status !== latest.status) return `status changes from ${latest.status} to ${draft.status}`;
  if (!terms.some((t) => quoteOnPage(t, draft.quote))) return "the quote doesn't name the asset";
  return null;
}

/** A claim committed without review is marked so on the page when its source is off the trusted list. */
export function claimUnreviewed(draft: ClaimDraft, trustedDomains: readonly string[]): boolean {
  return !isTrusted(draft.url, trustedDomains);
}

/** House style for UI copy: no em dashes. */
export function tidyStatement(statement: string): string {
  return statement.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

export function toEvidence(draft: ClaimDraft, recordedAt: string, unreviewed = false): Evidence {
  return {
    status: draft.status,
    sourceType: draft.sourceType,
    statement: tidyStatement(draft.statement),
    url: draft.url,
    observedAt: draft.observedAt,
    recordedAt,
    ...(unreviewed ? { unreviewed: true as const } : {}),
  };
}

/** Adds evidence to the record with this id, newest first. Throws for an unknown id. */
export function addEvidence<T extends CuratedRecord>(records: T[], id: string, evidence: Evidence): T[] {
  if (!records.some((r) => r.id === id)) throw new Error(`no curated record ${id}`);
  return records.map((r) => (r.id === id ? { ...r, evidence: [evidence, ...r.evidence] } : r));
}
