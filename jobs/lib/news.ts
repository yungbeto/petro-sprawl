// News scan (SPEC M9): headlines from GDELT and Google News RSS, matched to mapped assets, grouped into
// stories, and the checks every draft must pass before it touches data/curated/disruptions.json. Pure.

import { z } from 'zod';
import type { Disruption, NewsHeadline, SourceRef } from '../../src/types';
import { NEWS } from '../../src/lib/config';
import { daysBetween, htmlToText, isTrusted, matchKey, quoteOnPage, urlKey, type Page } from './claims';

export type Feed = 'gdelt' | 'google-news';

export interface Article {
  /** The article itself for GDELT; a Google News redirect that can't be read for Google News. */
  url: string;
  title: string;
  publisher: string;
  domain: string;
  /** YYYY-MM-DD, as the feed reports it. Only a hint: drafts take the date from the page. */
  publishedAt: string;
  feed: Feed;
  /** Stable across runs, so a headline is drafted from once. */
  key: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** GDELT DOC 2.0 ArtList JSON. `seendate` is when GDELT saw it ("20261027T091500Z"). */
export function parseGdelt(json: unknown): Article[] {
  const articles = (json as { articles?: unknown[] } | null)?.articles;
  if (!Array.isArray(articles)) return [];
  return articles.flatMap((a) => {
    const { url, title, domain, seendate } = a as Record<string, unknown>;
    if (typeof url !== 'string' || typeof title !== 'string' || typeof seendate !== 'string') return [];
    const date = seendate.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!date || !/^https?:\/\//.test(url)) return [];
    const host = typeof domain === 'string' && domain ? domain.toLowerCase() : hostOf(url);
    return [
      {
        url,
        title: title.replace(/\s+/g, ' ').trim(),
        publisher: host,
        domain: host,
        publishedAt: `${date[1]}-${date[2]}-${date[3]}`,
        feed: 'gdelt' as const,
        key: urlKey(url),
      },
    ];
  });
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => XML_ENTITIES[n.toLowerCase()] ?? m);
const tag = (item: string, name: string) => item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1];

/**
 * Google News search RSS. Titles end " - Publisher"; `<source url>` gives the publisher's site. Links
 * are Google redirects, so these items rank stories and name publishers but are never drafted from directly.
 */
export function parseGoogleNewsRss(xml: string): Article[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const rawTitle = tag(item!, 'title');
    const link = tag(item!, 'link');
    const pubDate = tag(item!, 'pubDate');
    const source = item!.match(/<source\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
    const guid = tag(item!, 'guid');
    if (!rawTitle || !link || !pubDate || !source) return [];
    const time = Date.parse(pubDate);
    if (Number.isNaN(time)) return [];
    const publisher = unescapeXml(source[2]!).trim();
    let title = unescapeXml(rawTitle).trim();
    if (title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
    return [
      {
        url: unescapeXml(link).trim(),
        title,
        publisher,
        domain: hostOf(source[1]!),
        publishedAt: new Date(time).toISOString().slice(0, 10),
        feed: 'google-news' as const,
        key: `gn:${unescapeXml(guid ?? link).trim()}`,
      },
    ];
  });
}

export interface AssetEntry {
  /** "pipeline/<id>", "chokepoint/<id>", "lng/<id>" or "terminal/<id>". */
  ref: string;
  name: string;
  aliases: string[];
}

export interface AssetTerm {
  ref: string;
  /** As written, for feed queries. */
  text: string;
  /** matchKey form, for matching. */
  key: string;
  /** Needs an energy word in the same headline. */
  weak: boolean;
}

const ENERGY_WORDS =
  /\b(oil|gas|crude|lng|pipelines?|terminals?|tankers?|exports?|imports?|fuel|energy|refiner(?:y|ies)|barrels?|loadings?|shipments?|flows?|supply|supplies)\b/;

/**
 * Every name an asset goes by in news: parts of its display name, its aliases and NEWS.extraTerms. GEM's
 * section aliases ("South Caucasus Gas Pipeline · Main Line") give only the system's name: section
 * names like "Main Line" would match unrelated headlines.
 */
export function assetTermsFor(asset: AssetEntry): AssetTerm[] {
  const parts = asset.name.split(/\s*[·()]\s*/);
  const texts = [...parts, ...asset.aliases.map((a) => a.split(/\s*·\s*/)[0]!), ...(NEWS.extraTerms[asset.ref] ?? [])];
  const drop = new Set<string>(NEWS.dropTerms.map(matchKey));
  const weak = new Set<string>(NEWS.weakTerms.map(matchKey));
  const seen = new Set<string>();
  const terms: AssetTerm[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    const key = matchKey(text);
    if (key.replace(/ /g, '').length < 3 || drop.has(key) || seen.has(key)) continue;
    seen.add(key);
    terms.push({ ref: asset.ref, text, key, weak: weak.has(key) || key.replace(/ /g, '').length <= 4 });
  }
  return terms;
}

/**
 * Assets a headline names, by whole words. Where one asset's name sits inside another's in the same
 * headline ("Nord Stream" in "Nord Stream 2"), only the longer counts. Weak names need an energy word.
 */
export function matchAssets(title: string, terms: readonly AssetTerm[]): string[] {
  const text = ` ${matchKey(title)} `;
  const energy = ENERGY_WORDS.test(text);
  const hits: { ref: string; start: number; end: number }[] = [];
  for (const t of terms) {
    if (t.weak && !energy) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(` ${t.key} `, from);
      if (at < 0) break;
      hits.push({ ref: t.ref, start: at, end: at + t.key.length + 2 });
      from = at + 1;
    }
  }
  const kept = hits.filter(
    (h) => !hits.some((o) => o.ref !== h.ref && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start),
  );
  return [...new Set(kept.map((h) => h.ref))];
}

/**
 * The names to search each feed for, in groups of NEWS.termsPerQuery: the shortest strong names first, a
 * few per asset, leaving out any that contains a name already searched ("Nord Stream Gas Pipeline" once
 * "Nord Stream" is), since a phrase search for the shorter finds it too. Weak names are left out.
 */
export function queryBatches(terms: readonly AssetTerm[], perQuery: number = NEWS.termsPerQuery, perAsset = 3): string[][] {
  const counts = new Map<string, number>();
  const chosen: { plain: string; key: string }[] = [];
  const strong = terms.filter((t) => !t.weak).sort((a, b) => a.key.length - b.key.length || a.ref.localeCompare(b.ref));
  for (const t of strong) {
    if ((counts.get(t.ref) ?? 0) >= perAsset) continue;
    if (chosen.some((c) => ` ${t.key} `.includes(` ${c.key} `))) continue;
    // Feeds tokenize punctuation away; plain letters keep the phrase search simple.
    const plain = t.text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) continue;
    counts.set(t.ref, (counts.get(t.ref) ?? 0) + 1);
    chosen.push({ plain, key: t.key });
  }
  const batches: string[][] = [];
  for (let i = 0; i < chosen.length; i += perQuery) batches.push(chosen.slice(i, i + perQuery).map((c) => c.plain));
  return batches;
}

export interface Story {
  ref: string;
  articles: Article[];
  /** Distinct publishers, by site. */
  publishers: string[];
  newest: string;
  /** Some article hasn't been seen by an earlier run. */
  fresh: boolean;
}

/** One story per asset: its articles from the run, deduplicated by link and by headline per site. */
export function groupStories(articles: readonly Article[], terms: readonly AssetTerm[], seen: ReadonlySet<string>): Story[] {
  const byRef = new Map<string, Article[]>();
  for (const a of articles) {
    for (const ref of matchAssets(a.title, terms)) byRef.set(ref, [...(byRef.get(ref) ?? []), a]);
  }
  const stories: Story[] = [];
  for (const [ref, list] of byRef) {
    const unique: Article[] = [];
    const keys = new Set<string>();
    for (const a of list) {
      const k = `${a.domain}|${matchKey(a.title)}`;
      if (keys.has(a.key) || keys.has(k)) continue;
      keys.add(a.key);
      keys.add(k);
      unique.push(a);
    }
    unique.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    stories.push({
      ref,
      articles: unique,
      publishers: [...new Set(unique.map((a) => a.domain || a.publisher))],
      newest: unique[0]!.publishedAt,
      fresh: unique.some((a) => !seen.has(a.key)),
    });
  }
  return stories;
}

/**
 * Stories worth a draft: fresh, and carried by NEWS.minPublishers outlets, a trusted domain, or on an
 * asset with a measured change. Most publishers first, then the newest. At most NEWS.maxStoriesPerRun.
 */
export function rankStories(
  stories: readonly Story[],
  { trustedDomains, measured }: { trustedDomains: readonly string[]; measured: ReadonlySet<string> },
): Story[] {
  const trusted = (s: Story) => s.articles.some((a) => a.domain && isTrusted(`https://${a.domain}/`, trustedDomains));
  return stories
    .filter((s) => s.fresh && (s.publishers.length >= NEWS.minPublishers || trusted(s) || measured.has(s.ref)))
    .sort((a, b) => b.publishers.length - a.publishers.length || b.newest.localeCompare(a.newest) || a.ref.localeCompare(b.ref))
    .slice(0, NEWS.maxStoriesPerRun);
}

/** Articles whose pages can be read and checked: GDELT links, trusted sites first, then newest. */
export function readableArticles(story: Story, trustedDomains: readonly string[]): Article[] {
  return story.articles
    .filter((a) => a.feed === 'gdelt')
    .sort(
      (a, b) =>
        Number(isTrusted(b.url, trustedDomains)) - Number(isTrusted(a.url, trustedDomains)) || b.publishedAt.localeCompare(a.publishedAt),
    )
    .slice(0, NEWS.pagesPerStory);
}

/** Google News failures in a row; a run that reached it resets the count. */
export function nextGoogleNewsHealth(previous: { consecutiveFailures: number }, ok: boolean, today: string) {
  return ok ? { consecutiveFailures: 0, lastOk: today } : { ...previous, consecutiveFailures: previous.consecutiveFailures + 1 };
}

/** Drops seen keys older than NEWS.seenDays. */
export function pruneSeen(seen: Record<string, string>, today: string): Record<string, string> {
  return Object.fromEntries(Object.entries(seen).filter(([, date]) => daysBetween(date, today) <= NEWS.seenDays));
}

const CAUSES = ['sabotage', 'sanction', 'maintenance', 'commercial', 'conflict', 'accident', 'other'] as const;

/**
 * What Claude returns for one story or end check. `add_source`: the article reports on a disruption in
 * effect. `new_disruption`: it reports one we don't have. `end_disruption`: it reports one has ended.
 * Fields that don't apply are empty strings.
 */
export const newsDraftSchema = z.object({
  action: z.enum(['add_source', 'new_disruption', 'end_disruption', 'none']),
  disruptionId: z.string(),
  url: z.string(),
  publisher: z.string(),
  quote: z.string(),
  /** For a new disruption, its cause; for a source, a cause only when the article gives a different one. */
  cause: z.enum([...CAUSES, '']),
  startedAt: z.string(),
  summary: z.string(),
  endedAt: z.string(),
});
export type NewsDraft = z.infer<typeof newsDraftSchema>;

/** A draft that passed the checks but needs a person: data/reports/disruption-drafts.json, applied for the pull request. */
export interface DisruptionDraftRecord {
  ref: string;
  reason: string;
  action: Exclude<NewsDraft['action'], 'none'>;
  disruptionId?: string;
  source: SourceRef;
  disruption?: Disruption;
  endedAt?: string;
  cause?: Disruption['cause'];
}

/**
 * The cheap first look at a story: from the headlines alone, whether one reports a development in a
 * disruption, a new one or an end, and which (numbered from 1; 0 for none). Only then does a draft read
 * or search for the article.
 */
export const triageSchema = z.object({ relevant: z.boolean(), headline: z.number().int() });
export type Triage = z.infer<typeof triageSchema>;

/** Disruptions in effect on one asset. */
export function inEffect(disruptions: readonly Disruption[], ref: string): Disruption[] {
  return disruptions.filter((d) => `${d.assetKind}/${d.assetId}` === ref && !d.endedAt);
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isDateOrMonth = (s: string) => isDate(s) || (/^\d{4}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}-01`)));

/**
 * Why a news draft can't be used; empty when it passes. Nothing the model says about the page is
 * trusted: the quote must be on it and name the asset, and the date comes from the page's metadata.
 */
export function verifyNewsDraft(
  draft: NewsDraft,
  page: Page,
  {
    ref,
    terms,
    disruptions,
    today,
    cited,
    quoteWords,
  }: {
    ref: string;
    terms: readonly AssetTerm[];
    disruptions: readonly Disruption[];
    today: string;
    cited: ReadonlySet<string>;
    quoteWords: { min: number; max: number };
  },
): string[] {
  const problems: string[] = [];
  if (!/^https?:\/\//.test(draft.url) || hostOf(draft.url) === 'news.google.com') problems.push('no article link');
  else if (cited.has(urlKey(draft.url))) problems.push('source already cited');
  const words = matchKey(draft.quote).split(' ').filter(Boolean).length;
  if (words < quoteWords.min || words > quoteWords.max) problems.push(`quote is ${words} words`);
  else if (!quoteOnPage(draft.quote, page.text)) problems.push('quote not found on the page');
  else if (!terms.some((t) => t.ref === ref && quoteOnPage(t.text, draft.quote))) problems.push("the quote doesn't name the asset");
  const published = page.publishedAt;
  if (!published) problems.push('page has no publication date');
  else {
    if (published > today) problems.push('page is dated in the future');
    if (daysBetween(published, today) > NEWS.maxArticleAgeDays) problems.push(`page is older than ${NEWS.maxArticleAgeDays} days`);
  }
  const current = inEffect(disruptions, ref);
  const target = current.find((d) => d.id === draft.disruptionId);
  switch (draft.action) {
    case 'none':
      problems.push('no draft');
      break;
    case 'add_source':
      if (!target) problems.push(`no disruption in effect with id "${draft.disruptionId}" on ${ref}`);
      else if (published && published < target.startedAt) problems.push('published before the disruption started');
      break;
    case 'end_disruption':
      if (!target) problems.push(`no disruption in effect with id "${draft.disruptionId}" on ${ref}`);
      if (!isDate(draft.endedAt)) problems.push(`end "${draft.endedAt}" isn't a date`);
      else {
        if (published && draft.endedAt > published) problems.push('ends after the page was published');
        if (target && draft.endedAt < target.startedAt) problems.push('ends before it started');
      }
      break;
    case 'new_disruption':
      if (!isDateOrMonth(draft.startedAt)) problems.push(`start "${draft.startedAt}" isn't a date`);
      else if (published && draft.startedAt > published) problems.push('starts after the page was published');
      if (!draft.cause) problems.push('no cause');
      if (!draft.summary.trim()) problems.push('no summary');
      else if (draft.summary.length > 600) problems.push('summary is longer than 600 characters');
      break;
  }
  return problems;
}

/**
 * Committed without review only when the draft adds a source, from a trusted domain, to a disruption in
 * effect without changing its cause (decided 2026-10-31: published with a "not yet reviewed" note).
 * New disruptions and end dates always go to the pull request.
 */
export function disruptionReview(
  draft: NewsDraft,
  disruption: Disruption | undefined,
  trustedDomains: readonly string[],
  story: { publishers: number; inEffect: number; today: string } = { publishers: 0, inEffect: 0, today: '' },
): string | null {
  if (draft.action === 'new_disruption') {
    // Published without review (decided 2026-11-03) when two outlets carry it, the page is a trusted one, it
    // started recently, and the asset shows nothing in effect it could be a development of.
    if (!isTrusted(draft.url, trustedDomains)) return `new disruption; ${hostOf(draft.url)} isn't on the trusted list`;
    if (story.publishers < NEWS.newDisruptionPublishers) return `new disruption reported by ${story.publishers} publisher${story.publishers === 1 ? '' : 's'}`;
    if (story.inEffect > 0) return 'new disruption on an asset with one in effect';
    if (!story.today || daysBetween(draft.startedAt, story.today) > NEWS.newDisruptionMaxAgeDays) return 'new disruption that started a while ago';
    return null;
  }
  // An end takes a card off Home: a misread ("talks to end the blockade") costs more than a new card.
  if (draft.action === 'end_disruption') return 'ends a disruption';
  if (draft.cause && disruption && draft.cause !== disruption.cause) return `cause changes from ${disruption.cause} to ${draft.cause}`;
  if (!isTrusted(draft.url, trustedDomains)) return `${hostOf(draft.url)} isn't on the trusted list`;
  return null;
}

/** The page's own headline: og:title, then <title>. */
export function pageTitle(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const text = og ? htmlToText(og) : '';
  return text || null;
}

/** A source for a disruption, dated by the page; `unreviewed` when it is committed without review. */
export function toSource(draft: NewsDraft, page: Page & { title: string | null }, unreviewed: boolean): SourceRef {
  return {
    publisher: draft.publisher.trim() || hostOf(draft.url),
    title: page.title ?? draft.publisher,
    url: draft.url,
    publishedAt: page.publishedAt!,
    ...(unreviewed ? { unreviewed: true as const } : {}),
  };
}

/** Adds a source to a disruption, newest first. Throws for an unknown id. */
export function addSource(disruptions: Disruption[], id: string, source: SourceRef): Disruption[] {
  if (!disruptions.some((d) => d.id === id)) throw new Error(`no disruption ${id}`);
  return disruptions.map((d) => (d.id === id ? { ...d, sources: [source, ...d.sources] } : d));
}

/** A slug for a new disruption that no other one uses: "<asset>-<start>", then "-2", "-3". */
export function disruptionId(assetId: string, startedAt: string, taken: ReadonlySet<string>): string {
  const base = `${assetId}-${startedAt}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Disruptions in effect due an end check: quiet since `quietSince`, or recovered on the meter, and not
 * checked in the last NEWS.endCheckDays. Long-settled stops in NEWS.endCheckSkip are left alone.
 */
export function endCheckCandidates(
  disruptions: readonly Disruption[],
  { quiet, recovered, checked, today }: { quiet: (d: Disruption) => boolean; recovered: ReadonlySet<string>; checked: Record<string, string>; today: string },
): Disruption[] {
  return disruptions
    .filter((d) => !d.endedAt && !(NEWS.endCheckSkip as readonly string[]).includes(d.id))
    .filter((d) => quiet(d) || recovered.has(`${d.assetKind}/${d.assetId}`))
    .filter((d) => !checked[d.id] || daysBetween(checked[d.id]!, today) >= NEWS.endCheckDays)
    .sort((a, b) => (checked[a.id] ?? '').localeCompare(checked[b.id] ?? '') || a.id.localeCompare(b.id))
    .slice(0, NEWS.maxEndChecksPerRun);
}

/**
 * Home's "In the news": the run's matched headlines from the last NEWS.headlineDays, one per headline
 * (the same title from several feeds or assets is one, naming them all, with a GDELT link over a Google
 * News one), newest first, at most NEWS.headlinesKept.
 */
export function headlineFeed(stories: readonly Story[], today: string): NewsHeadline[] {
  const byTitle = new Map<string, NewsHeadline>();
  for (const story of stories) {
    for (const a of story.articles) {
      if (daysBetween(a.publishedAt, today) > NEWS.headlineDays) continue;
      const key = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const known = byTitle.get(key);
      if (!known) {
        byTitle.set(key, { title: a.title, publisher: a.publisher, url: a.url, publishedAt: a.publishedAt, feed: a.feed, refs: [story.ref] });
        continue;
      }
      if (!known.refs.includes(story.ref)) known.refs.push(story.ref);
      if (known.feed === 'google-news' && a.feed === 'gdelt') Object.assign(known, { url: a.url, feed: a.feed });
    }
  }
  return [...byTitle.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.refs.length - a.refs.length || a.title.localeCompare(b.title))
    .slice(0, NEWS.headlinesKept);
}
