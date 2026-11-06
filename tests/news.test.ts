import { describe, expect, it } from 'vitest';
import {
  addSource,
  assetTermsFor,
  disruptionId,
  disruptionReview,
  headlineFeed,
  endCheckCandidates,
  groupStories,
  matchAssets,
  nextGoogleNewsHealth,
  pageTitle,
  parseGdelt,
  parseGoogleNewsRss,
  pruneSeen,
  queryBatches,
  rankStories,
  readableArticles,
  toSource,
  verifyNewsDraft,
  type Article,
  type NewsDraft,
  addEvent,
  verifyNewsEvent,
} from '../jobs/lib/news';
import type { Disruption } from '../src/types';

const assets = [
  { ref: 'terminal/ras-tanura', name: 'Ras Tanura', aliases: ['Ras Tanura terminal'] },
  { ref: 'pipeline/nord-stream-1', name: 'Nord Stream 1', aliases: ['Nord Stream'] },
  { ref: 'pipeline/nord-stream-2', name: 'Nord Stream 2', aliases: [] },
  { ref: 'pipeline/progress', name: 'Progress (Yamburg–Western border)', aliases: ['Progress Gas Pipeline'] },
  { ref: 'pipeline/btc', name: 'Baku–Tbilisi–Ceyhan (BTC)', aliases: ['BTC'] },
  { ref: 'pipeline/druzhba-north', name: 'Druzhba (northern branch)', aliases: ['Druzhba North'] },
  { ref: 'chokepoint/hormuz', name: 'Strait of Hormuz', aliases: [] },
];
const terms = assets.flatMap(assetTermsFor);

const article = (over: Partial<Article>): Article => ({
  url: 'https://www.reuters.com/a',
  title: 'Ras Tanura',
  publisher: 'reuters.com',
  domain: 'reuters.com',
  publishedAt: '2026-10-28',
  feed: 'gdelt',
  key: 'reuters.com/a',
  ...over,
});

describe('feeds', () => {
  it('reads GDELT article lists, dated by when GDELT saw them', () => {
    const articles = parseGdelt({
      articles: [
        { url: 'https://www.reuters.com/x', title: 'Fire  near Ras Tanura', domain: 'reuters.com', seendate: '20261027T091500Z' },
        { url: 'not a link', title: 'x', seendate: '20261027T091500Z' },
      ],
    });
    expect(articles).toEqual([
      expect.objectContaining({ title: 'Fire near Ras Tanura', domain: 'reuters.com', publishedAt: '2026-10-27', feed: 'gdelt', key: 'reuters.com/x' }),
    ]);
    expect(parseGdelt('rate limited')).toEqual([]);
  });

  it('reads Google News RSS, taking the publisher off the headline', () => {
    const xml = `<rss><channel><item><title>Gulf equities mixed as Ras Tanura strike unnerves investors &amp; traders - Reuters</title>
      <link>https://news.google.com/rss/articles/CBMi1?oc=5</link><guid isPermaLink="false">CBMi1</guid>
      <pubDate>Wed, 28 Oct 2026 13:04:50 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item></channel></rss>`;
    expect(parseGoogleNewsRss(xml)).toEqual([
      {
        url: 'https://news.google.com/rss/articles/CBMi1?oc=5',
        title: 'Gulf equities mixed as Ras Tanura strike unnerves investors & traders',
        publisher: 'Reuters',
        domain: 'reuters.com',
        publishedAt: '2026-10-28',
        feed: 'google-news',
        key: 'gn:CBMi1',
      },
    ]);
  });

  it('counts Google News failures in a row, and resets on a run that reached it', () => {
    expect(nextGoogleNewsHealth({ consecutiveFailures: 2 }, false, '2026-10-31')).toEqual({ consecutiveFailures: 3 });
    expect(nextGoogleNewsHealth({ consecutiveFailures: 2 }, true, '2026-10-31')).toEqual({ consecutiveFailures: 0, lastOk: '2026-10-31' });
  });
});

describe('matching headlines to assets', () => {
  it('matches whole names and aliases', () => {
    expect(matchAssets('Houthis strike Saudi Ras Tanura oil terminal', terms)).toEqual(['terminal/ras-tanura']);
    expect(matchAssets('Tanker traffic through Hormuz stays thin', terms)).toEqual(['chokepoint/hormuz']);
    expect(matchAssets('Rastanura is not a name we know', terms)).toEqual([]);
  });

  it('prefers the longer name where one sits inside another', () => {
    expect(matchAssets('Nord Stream 2 owner loses appeal', terms)).toEqual(['pipeline/nord-stream-2']);
    expect(matchAssets('Nord Stream probe names suspect', terms)).toEqual(['pipeline/nord-stream-1']);
  });

  it('needs an energy word for names that are also common words or tickers', () => {
    expect(matchAssets('BTC rallies past a record', terms)).toEqual([]);
    expect(matchAssets('Azerbaijan says BTC oil flows normal', terms)).toEqual(['pipeline/btc']);
    expect(matchAssets('Progress on talks in Geneva', terms)).toEqual([]);
    expect(terms.find((t) => t.key === 'northern branch')).toBeUndefined();
  });

  it('takes only the system name from GEM section aliases, and needs an energy word for Druzhba', () => {
    const scp = assetTermsFor({ ref: 'pipeline/scp', name: 'South Caucasus Pipeline (SCP)', aliases: ['South Caucasus Gas Pipeline · Main Line'] });
    expect(scp.map((t) => t.text)).toEqual(['South Caucasus Pipeline', 'SCP', 'South Caucasus Gas Pipeline']);
    expect(matchAssets('FC Druzhba Maykop sign striker', terms)).toEqual([]);
    expect(matchAssets('Druzhba oil flows to Hungary resume', terms)).toEqual(['pipeline/druzhba-north']);
  });

  it('needs an energy word for Bratstvo, Blue Stream and Ceyhan: a football club, a fiber company and a river too', () => {
    const more = [
      { ref: 'pipeline/brotherhood', name: 'Urengoy–Pomary–Uzhhorod (Brotherhood)', aliases: ['Bratstvo'] },
      { ref: 'pipeline/blue-stream', name: 'Blue Stream', aliases: [] },
    ].flatMap(assetTermsFor);
    expect(matchAssets('FK SSK Nova Skopje vs FK Bratstvo Ljubin live score, H2H and lineups', more)).toEqual([]);
    expect(matchAssets('Blue Stream securitizes revenue from HOA fiber optic contracts', more)).toEqual([]);
    expect(matchAssets('Turkey takes more gas through Blue Stream', more)).toEqual(['pipeline/blue-stream']);
    const ceyhan = assetTermsFor({ ref: 'terminal/ceyhan', name: 'Ceyhan', aliases: [] });
    expect(matchAssets('A vehicle rolled into the Ceyhan River at the bridge entrance in Kahramanmaraş', ceyhan)).toEqual([]);
    expect(matchAssets('Iraq resumes oil exports through Ceyhan', ceyhan)).toEqual(['terminal/ceyhan']);
    const towns = [
      { ref: 'terminal/sheskharis', name: 'Sheskharis (Novorossiysk)', aliases: [] },
      { ref: 'terminal/fujairah', name: 'Fujairah', aliases: ['Port of Fujairah'] },
    ].flatMap(assetTermsFor);
    expect(matchAssets('Novorossiysk hosts regional chess final', towns)).toEqual([]);
    expect(matchAssets('Drone attack hits Novorossiysk port', towns)).toEqual(['terminal/sheskharis']);
    expect(matchAssets('Fujairah football club signs coach', towns)).toEqual([]);
    expect(matchAssets('Port of Fujairah reopens berths', towns)).toEqual(['terminal/fujairah']);
    expect(matchAssets('Earthquake recorded off Fujairah coast', towns)).toEqual([]);
    expect(matchAssets('Fujairah’s LSMGO premium over Singapore widens', towns)).toEqual(['terminal/fujairah']);
  });

  it('builds feed queries from the shortest strong names, leaving out names a shorter one covers', () => {
    const batches = queryBatches(terms, 4);
    const all = batches.flat();
    expect(all).toContain('Ras Tanura');
    expect(all).toContain('Baku Tbilisi Ceyhan');
    expect(all).toContain('Nord Stream');
    expect(all).not.toContain('Nord Stream 2');
    expect(all).not.toContain('Ras Tanura terminal');
    expect(all).not.toContain('BTC');
    expect(batches.every((b) => b.length <= 4)).toBe(true);
  });
});

describe('stories', () => {
  const seen = new Set(['reuters.com/old']);
  const articles = [
    article({ key: 'reuters.com/a', title: 'Ras Tanura fire contained' }),
    article({ key: 'gn:1', feed: 'google-news', domain: 'bloomberg.com', publisher: 'Bloomberg', url: 'https://news.google.com/rss/articles/1', title: 'Saudi Arabia contains fire near Ras Tanura' }),
    // The same headline from the same site twice counts once.
    article({ key: 'gn:2', feed: 'google-news', domain: 'reuters.com', title: 'Ras Tanura fire contained' }),
    article({ key: 'reuters.com/old', title: 'Hormuz traffic', publishedAt: '2026-10-20' }),
  ];

  it('groups articles by asset and marks stories with unseen headlines as fresh', () => {
    const stories = groupStories(articles, terms, seen);
    const ras = stories.find((s) => s.ref === 'terminal/ras-tanura')!;
    expect(ras.articles).toHaveLength(2);
    expect(ras.publishers).toEqual(['reuters.com', 'bloomberg.com']);
    expect(ras.fresh).toBe(true);
    expect(stories.find((s) => s.ref === 'chokepoint/hormuz')?.fresh).toBe(false);
  });

  it('ranks fresh stories carried by two outlets, a trusted site or a measured change', () => {
    const stories = groupStories(
      [
        ...articles,
        article({ key: 'x.com/1', domain: 'smallsite.com', url: 'https://smallsite.com/1', title: 'Druzhba North oil flows halted' }),
      ],
      terms,
      seen,
    );
    const ranked = (measured: string[]) => rankStories(stories, { trustedDomains: ['reuters.com'], measured: new Set(measured) }).map((s) => s.ref);
    expect(ranked([])).toEqual(['terminal/ras-tanura']);
    expect(ranked(['pipeline/druzhba-north'])).toEqual(['terminal/ras-tanura', 'pipeline/druzhba-north']);
  });

  it('reads GDELT pages only, trusted sites first', () => {
    const [story] = groupStories(
      [
        article({ key: 'a', url: 'https://smallsite.com/ras', domain: 'smallsite.com', title: 'Ras Tanura hit' }),
        article({ key: 'b', url: 'https://www.reuters.com/ras', title: 'Ras Tanura fire', publishedAt: '2026-10-27' }),
        article({ key: 'gn:c', feed: 'google-news', domain: 'bloomberg.com', title: 'Ras Tanura again' }),
      ],
      terms,
      new Set(),
    );
    expect(readableArticles(story!, ['reuters.com']).map((a) => a.url)).toEqual(['https://www.reuters.com/ras', 'https://smallsite.com/ras']);
  });

  it('forgets seen headlines after three weeks', () => {
    expect(pruneSeen({ a: '2026-10-01', b: '2026-10-20' }, '2026-10-31')).toEqual({ b: '2026-10-20' });
  });
});

describe('checking drafts', () => {
  const fire: Disruption = {
    id: 'ras-tanura-2026-10-fire',
    assetKind: 'terminal',
    assetId: 'ras-tanura',
    startedAt: '2026-10-27',
    cause: 'other',
    summary: 'A fire near Ras Tanura.',
    sources: [{ publisher: 'Rigzone', title: 'Fire', url: 'https://www.rigzone.com/fire', publishedAt: '2026-10-27' }],
    recordedAt: '2026-10-29',
  };
  const quote = 'Yemen’s Houthis said on Tuesday they had struck the Ras Tanura oil terminal with a missile.';
  const page = { text: `Some text. ${quote} More text.`, publishedAt: '2026-10-28', title: 'Houthis claim strike on Ras Tanura' };
  const draft = (over: Partial<NewsDraft>): NewsDraft => ({
    action: 'add_source',
    disruptionId: fire.id,
    url: 'https://www.reuters.com/world/ras-tanura',
    publisher: 'Reuters',
    quote,
    cause: '',
    startedAt: '',
    summary: '',
    endedAt: '',
    eventAt: '',
    eventText: '',
    ...over,
  });
  const options = {
    ref: 'terminal/ras-tanura',
    terms,
    disruptions: [fire],
    today: '2026-10-31',
    cited: new Set(['rigzone.com/fire']),
    quoteWords: { min: 6, max: 50 },
  };

  it('passes a source quoted from the page, naming the asset, dated by the page', () => {
    expect(verifyNewsDraft(draft({}), page, options)).toEqual([]);
  });

  it('rejects what the page does not back', () => {
    expect(verifyNewsDraft(draft({ quote: 'The terminal was struck by a large missile on Tuesday.' }), page, options)).toContain('quote not found on the page');
    expect(verifyNewsDraft(draft({ quote: 'Some text. More text and then some more words here.' }), { ...page, text: 'Some text. More text and then some more words here.' }, options)).toContain(
      "the quote doesn't name the asset",
    );
    expect(verifyNewsDraft(draft({}), { ...page, publishedAt: null }, options)).toContain('page has no publication date');
    expect(verifyNewsDraft(draft({ url: 'https://www.rigzone.com/fire' }), page, options)).toContain('source already cited');
    expect(verifyNewsDraft(draft({ url: 'https://news.google.com/rss/articles/x' }), page, options)).toContain('no article link');
    expect(verifyNewsDraft(draft({ disruptionId: 'made-up' }), page, options)[0]).toMatch(/no disruption in effect/);
    expect(verifyNewsDraft(draft({}), { ...page, publishedAt: '2026-09-01' }, options)).toContain('page is older than 14 days');
  });

  it('checks new disruptions and end dates against the page date', () => {
    const fresh = draft({ action: 'new_disruption', disruptionId: '', startedAt: '2026-10-29', cause: 'conflict', summary: 'Yemen’s Houthis said they struck it.' });
    expect(verifyNewsDraft(fresh, page, options)).toContain('starts after the page was published');
    expect(verifyNewsDraft({ ...fresh, startedAt: '2026-10-27' }, page, options)).toEqual([]);
    expect(verifyNewsDraft({ ...fresh, startedAt: '2026-10-27', cause: '' }, page, options)).toContain('no cause');
    expect(verifyNewsDraft(draft({ action: 'end_disruption', endedAt: '2026-10-30' }), page, options)).toContain('ends after the page was published');
    expect(verifyNewsDraft(draft({ action: 'end_disruption', endedAt: '2026-10-28' }), page, options)).toEqual([]);
  });

  it('publishes a new disruption when two outlets carry it, from a trusted page, recent, on an asset with none in effect', () => {
    const fresh = draft({ action: 'new_disruption', disruptionId: '', startedAt: '2026-10-27', cause: 'conflict' });
    const story = { publishers: 2, inEffect: 0, today: '2026-10-29' };
    expect(disruptionReview(fresh, undefined, ['reuters.com'], story)).toBeNull();
    expect(disruptionReview(fresh, undefined, ['reuters.com'], { ...story, publishers: 1 })).toBe('new disruption reported by 1 publisher');
    expect(disruptionReview({ ...fresh, url: 'https://smallsite.com/x' }, undefined, ['reuters.com'], story)).toBe("new disruption; smallsite.com isn't on the trusted list");
    expect(disruptionReview(fresh, undefined, ['reuters.com'], { ...story, inEffect: 1 })).toBe('new disruption on an asset with one in effect');
    expect(disruptionReview({ ...fresh, startedAt: '2026-10-01' }, undefined, ['reuters.com'], story)).toBe('new disruption that started a while ago');
    // An end always waits, however well sourced.
    expect(disruptionReview(draft({ action: 'end_disruption', endedAt: '2026-10-28' }), fire, ['reuters.com'], story)).toBe('ends a disruption');
  });

  it('commits a source from any domain on a disruption in effect with the same cause', () => {
    expect(disruptionReview(draft({}), fire, ['reuters.com'])).toBeNull();
    expect(disruptionReview(draft({ url: 'https://smallsite.com/x' }), fire, ['reuters.com'])).toBeNull();
    expect(disruptionReview(draft({ cause: 'conflict' }), fire, ['reuters.com'])).toBe('cause changes from other to conflict');
    expect(disruptionReview(draft({ action: 'new_disruption', startedAt: '2026-10-27' }), undefined, ['reuters.com'])).toBe('new disruption reported by 0 publishers');
    expect(disruptionReview(draft({ action: 'end_disruption' }), fire, ['reuters.com'])).toBe('ends a disruption');
  });

  it('takes the source title and date from the page, and marks what goes in unreviewed', () => {
    const source = toSource(draft({}), page, true);
    expect(source).toEqual({
      publisher: 'Reuters',
      title: 'Houthis claim strike on Ras Tanura',
      url: 'https://www.reuters.com/world/ras-tanura',
      publishedAt: '2026-10-28',
      unreviewed: true,
    });
    expect(addSource([fire], fire.id, source)[0]!.sources[0]).toBe(source);
    expect(() => addSource([fire], 'nope', source)).toThrow();
    expect(toSource(draft({}), page, false).unreviewed).toBeUndefined();
  });

  it('reads a page title and names new disruptions uniquely', () => {
    expect(pageTitle('<meta property="og:title" content="Houthis claim strike &amp; fire">')).toBe('Houthis claim strike & fire');
    expect(pageTitle('<title> Plain title </title>')).toBe('Plain title');
    expect(disruptionId('ras-tanura', '2026-10-27', new Set(['ras-tanura-2026-10-27']))).toBe('ras-tanura-2026-10-27-2');
  });

  it('picks quiet or recovered disruptions for an end check, once a week', () => {
    const quiet = { ...fire, id: 'quiet' };
    const recovered = { ...fire, id: 'recovered', assetKind: 'chokepoint' as const, assetId: 'babelm' };
    const settled = { ...fire, id: 'gme-2021-algeria-halt' };
    const picks = (checked: Record<string, string>) =>
      endCheckCandidates([fire, quiet, recovered, settled, { ...fire, id: 'over', endedAt: '2026-10-30' }], {
        quiet: (d) => d.id === 'quiet' || d.id === 'gme-2021-algeria-halt',
        recovered: new Set(['chokepoint/babelm']),
        checked,
        today: '2026-10-31',
      }).map((d) => d.id);
    expect(picks({})).toEqual(['quiet', 'recovered']);
    expect(picks({ quiet: '2026-10-28' })).toEqual(['recovered']);
    expect(picks({ quiet: '2026-10-24' })).toEqual(['recovered', 'quiet']);
  });

  it('checks a drafted event on its own: a day on or after the start, not after the page, within the lag', () => {
    const event = (over: Partial<NewsDraft>) => verifyNewsEvent(draft({ eventText: 'The Houthis say they struck the terminal.', eventAt: '2026-10-27', ...over }), '2026-10-28', fire);
    expect(event({})).toEqual([]);
    expect(event({ eventText: '' })).toEqual(['no event']);
    expect(event({ action: 'end_disruption' })).toEqual(['no event']);
    expect(event({ eventAt: '2026-10' })).toEqual(['event date "2026-10" isn\'t a day']);
    expect(event({ eventAt: '2026-10-29' })).toEqual(['event is after the page was published']);
    expect(event({ eventAt: '2026-10-26' })).toEqual(['event is before the disruption started']);
    expect(verifyNewsEvent(draft({ eventText: 'Old news.', eventAt: '2026-10-27' }), '2026-11-06', fire)).toEqual(['event is more than 7 days before the page']);
    expect(event({ eventText: 'x'.repeat(300) })).toEqual(['event is longer than 220 characters']);
    const listed = { ...fire, events: [{ at: '2026-10-27', text: 'Struck.', source: 'https://www.reuters.com/world/ras-tanura' }] };
    expect(verifyNewsEvent(draft({ eventText: 'Struck.', eventAt: '2026-10-27' }), '2026-10-28', listed)).toEqual(['event already listed']);
  });

  it('adds an event in date order, and its source when the disruption lacks it', () => {
    const source = { publisher: 'Reuters', title: 'Strike', url: 'https://www.reuters.com/world/ras-tanura', publishedAt: '2026-10-28' };
    const withEarlier = { ...fire, events: [{ at: '2026-10-30', text: 'Later.', source: fire.sources[0]!.url }] };
    const [out] = addEvent([withEarlier], fire.id, { at: '2026-10-27', text: 'Struck.', source: source.url }, source);
    expect(out!.events!.map((e) => e.at)).toEqual(['2026-10-27', '2026-10-30']);
    expect(out!.sources.map((x) => x.url)).toEqual([source.url, fire.sources[0]!.url]);
    const [again] = addEvent([out!], fire.id, { at: '2026-10-28', text: 'Again.', source: source.url }, source);
    expect(again!.sources).toHaveLength(2);
    expect(() => addEvent([fire], 'nope', { at: '2026-10-27', text: 'x', source: source.url }, source)).toThrow();
  });
});

describe('headlineFeed', () => {
  const article = (title: string, feed: 'gdelt' | 'google-news', publishedAt = '2026-11-03') => ({
    url: feed === 'gdelt' ? `https://site.com/${title.length}` : 'https://news.google.com/rss/articles/x',
    title,
    publisher: 'Site',
    domain: 'site.com',
    publishedAt,
    feed,
    key: `${feed}:${title}`,
  });
  it('keeps one per headline, naming every asset, with the readable link, newest first, within the window', () => {
    const stories = [
      { ref: 'chokepoint/hormuz', articles: [article('Strike on Qeshm', 'google-news'), article('Old news', 'gdelt', '2026-10-10')], publishers: ['site.com'], newest: '2026-11-03', fresh: true },
      { ref: 'terminal/kharg', articles: [article('Strike on Qeshm!', 'gdelt'), article('Kharg loads resume', 'gdelt', '2026-11-02')], publishers: ['site.com'], newest: '2026-11-03', fresh: true },
    ];
    const feed = headlineFeed(stories, '2026-11-03');
    expect(feed.map((h) => h.title)).toEqual(['Strike on Qeshm', 'Kharg loads resume']);
    expect(feed[0]).toMatchObject({ refs: ['chokepoint/hormuz', 'terminal/kharg'], feed: 'gdelt', url: 'https://site.com/16' });
  });
  it("keeps the publisher's site for its icon, lowercase without www", () => {
    const story = { ref: 'terminal/kharg', articles: [{ ...article('Kharg loads resume', 'google-news'), domain: 'WWW.Site.com' }], publishers: ['site.com'], newest: '2026-11-03', fresh: true };
    expect(headlineFeed([story], '2026-11-03')[0]?.site).toBe('site.com');
    const none = { ...story, articles: [{ ...story.articles[0]!, domain: '' }] };
    expect(headlineFeed([none], '2026-11-03')[0]).not.toHaveProperty('site');
  });
  it('leaves out social posts, reference pages and press release wires', () => {
    const from = (domain: string, title: string) => ({ ...article(title, 'google-news'), domain, key: domain });
    const stories = [
      {
        ref: 'chokepoint/hormuz',
        articles: [from('facebook.com', 'Post on Hormuz'), from('m.facebook.com', 'Another post'), from('britannica.com', 'Strait of Hormuz explained'), from('apnews.com', 'Tankers wait at Hormuz')],
        publishers: ['apnews.com'],
        newest: '2026-11-03',
        fresh: true,
      },
    ];
    expect(headlineFeed(stories, '2026-11-03').map((h) => h.title)).toEqual(['Tankers wait at Hormuz']);
  });

  const kept = (title: string, refs: string[], publishedAt: string, feed: 'gdelt' | 'google-news' = 'gdelt') => ({
    title,
    publisher: 'Site',
    url: `https://site.com/${encodeURIComponent(title)}`,
    publishedAt,
    feed,
    refs,
  });

  it("carries the last file's headlines within the window, matched again with today's rules", () => {
    const stories = [{ ref: 'terminal/kharg', articles: [article('Kharg loads resume', 'gdelt')], publishers: ['site.com'], newest: '2026-11-03', fresh: true }];
    const previous = [
      kept('Kharg loads resume', ['terminal/kharg'], '2026-11-03'),
      kept('Langeled flows dip', ['pipeline/langeled'], '2026-10-27'),
      kept('Blue Stream fiber deal', ['pipeline/blue-stream'], '2026-11-01'),
      kept('Medgaz back at full rate', ['pipeline/medgaz'], '2026-10-10'),
    ];
    const refsFor = (title: string) => (title.includes('fiber') ? [] : title.startsWith('Langeled') ? ['pipeline/langeled'] : ['pipeline/medgaz']);
    const feed = headlineFeed(stories, '2026-11-03', { previous, refsFor });
    // Kharg once (this run's), Langeled carried over, the fiber story no longer matches, Medgaz is past the window.
    expect(feed.map((h) => h.title)).toEqual(['Kharg loads resume', 'Langeled flows dip']);
  });

  it("keeps every asset's newest few alongside Home's newest, so a busy strait doesn't crowd out a quiet pipeline", () => {
    const hormuz = Array.from({ length: 60 }, (_, i) => kept(`Hormuz story ${i}`, ['chokepoint/hormuz'], '2026-11-03'));
    const langeled = Array.from({ length: 7 }, (_, i) => kept(`Langeled story ${i}`, ['pipeline/langeled'], '2026-10-30'));
    const feed = headlineFeed([], '2026-11-03', { previous: [...hormuz, ...langeled] });
    expect(feed).toHaveLength(40 + 5);
    expect(feed.filter((h) => h.refs.includes('pipeline/langeled'))).toHaveLength(5);
    // Newest first, so Home's list is still the file's top.
    expect(feed.slice(0, 40).every((h) => h.refs.includes('chokepoint/hormuz'))).toBe(true);
  });
});
