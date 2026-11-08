import { describe, expect, it } from 'vitest';
import {
  apiFailure,
  addEvidence,
  assetTerms,
  claimUnreviewed,
  htmlToText,
  isTrusted,
  needsReview,
  pagePublishedAt,
  quoteOnPage,
  staleAssets,
  tidyStatement,
  toEvidence,
  unclaimedAssets,
  urlKey,
  verifyDraft,
  type ClaimDraft,
} from '../jobs/lib/claims';
import type { Evidence } from '../src/types';

const claim = (status: Evidence['status'], observedAt: string, sourceType: Evidence['sourceType'] = 'press'): Evidence => ({
  status,
  sourceType,
  statement: 'x',
  url: 'https://example.com/old',
  observedAt,
  recordedAt: observedAt,
});

const draft = (over: Partial<ClaimDraft> = {}): ClaimDraft => ({
  found: true,
  status: 'operating',
  sourceType: 'press',
  publisher: 'Reuters',
  url: 'https://www.reuters.com/business/energy/cpc-loadings-2026-10-28/',
  quote: 'The loading plan points to broadly stable exports, the sources said.',
  observedAt: '2026-10-28',
  statement: 'CPC plans broadly stable exports in November (Reuters).',
  ...over,
});

const opts = { today: '2026-10-29', cited: new Set<string>(), quoteWords: { min: 6, max: 50 }, firstClaimDays: 90 };
const page = { text: 'Intro. The loading plan points to broadly stable exports, the sources said. More.', publishedAt: '2026-10-28' };

describe('staleAssets', () => {
  it('picks assets whose newest cited claim is older than the limit, oldest first', () => {
    const assets = [
      { ref: 'pipeline/a', name: 'A', evidence: [claim('operating', '2026-09-01'), claim('operating', '2026-10-20', 'dataset')] },
      { ref: 'pipeline/b', name: 'B', evidence: [claim('operating', '2026-10-15')] },
      { ref: 'pipeline/c', name: 'C', evidence: [claim('idle', '2026-07-01')] },
      { ref: 'pipeline/d', name: 'D', evidence: [claim('operating', '2026-01-01', 'dataset')] },
      { ref: 'pipeline/skip', name: 'S', evidence: [claim('offline', '2022-01-01')] },
    ];
    const stale = staleAssets(assets, { today: '2026-10-29', staleDays: 30, skip: ['pipeline/skip'] });
    expect(stale.map((s) => s.ref)).toEqual(['pipeline/c', 'pipeline/a']);
    expect(stale[1]?.latest.observedAt).toBe('2026-09-01');
  });
});

describe('unclaimedAssets', () => {
  it('picks assets with no cited claim, measured or dataset entries aside', () => {
    const assets = [
      { ref: 'terminal/a', name: 'A', evidence: [] },
      { ref: 'terminal/b', name: 'B', evidence: [claim('operating', '2026-01-01')] },
      { ref: 'pipeline/c', name: 'C', evidence: [claim('operating', '2026-10-20', 'dataset')] },
      { ref: 'terminal/skip', name: 'S', evidence: [] },
    ];
    expect(unclaimedAssets(assets, { skip: ['terminal/skip'] })).toEqual([
      { ref: 'terminal/a', name: 'A', latest: null },
      { ref: 'pipeline/c', name: 'C', latest: null },
    ]);
  });
});

describe('page reading', () => {
  it('keeps visible text and decodes entities', () => {
    expect(htmlToText('<p>Flows &amp; loadings<script>var x = "no";</script> rose&nbsp;9&#37;</p>')).toBe('Flows & loadings rose 9%');
  });

  it('finds quotes despite curly quotes, dashes and line breaks', () => {
    expect(quoteOnPage('"Exports are stable" - he said', 'He added: “Exports are\nstable” – he said.')).toBe(true);
    expect(quoteOnPage('Exports are stable', 'Exports are unstable')).toBe(false);
    expect(quoteOnPage('stable exports', 'unstable exports')).toBe(false);
  });

  it('reads the publication date from metadata in either attribute order', () => {
    expect(pagePublishedAt('<meta property="article:published_time" content="2026-10-28T09:06:00Z">')).toBe('2026-10-28');
    expect(pagePublishedAt('<meta content="2026-10-27" name="date">')).toBe('2026-10-27');
    expect(pagePublishedAt('<script type="application/ld+json">{"datePublished": "2026-10-26T10:00:00+03:00"}</script>')).toBe('2026-10-26');
    expect(pagePublishedAt('<time datetime="2026-10-25">')).toBeNull();
  });
});

describe('verifyDraft', () => {
  const latest = claim('operating', '2026-09-30');

  it('passes a draft whose quote is on a page published after the current claim', () => {
    expect(verifyDraft(draft(), page, latest, opts)).toEqual([]);
  });

  it('rejects quotes that are not on the page, or too short to check', () => {
    expect(verifyDraft(draft({ quote: 'The loading plan points to sharply lower exports.' }), page, latest, opts)).toEqual([
      'quote not found on the page',
    ]);
    expect(verifyDraft(draft({ quote: 'stable exports' }), page, latest, opts)).toEqual(['quote is 2 words']);
  });

  it('rejects dates the page cannot support', () => {
    expect(verifyDraft(draft(), { ...page, publishedAt: null }, latest, opts)).toEqual(['page has no publication date']);
    expect(verifyDraft(draft({ observedAt: '2026-10-29' }), page, latest, opts)).toEqual([
      'refers to 2026-10-29, after the page was published (2026-10-28)',
    ]);
    expect(verifyDraft(draft({ observedAt: '2026-09-30' }), page, latest, opts)).toEqual([
      'not newer than the current claim (2026-09-30)',
    ]);
    expect(verifyDraft(draft({ observedAt: 'late October' }), page, latest, opts)).toEqual(['date "late October" isn\'t a date']);
  });

  it('rejects sources we already cite', () => {
    const cited = new Set([urlKey('https://reuters.com/business/energy/cpc-loadings-2026-10-28')]);
    expect(verifyDraft(draft(), page, latest, { ...opts, cited })).toEqual(['source already cited']);
  });
});

describe('verifyDraft for a first claim', () => {
  it('takes any recent date, but nothing older than the window', () => {
    expect(verifyDraft(draft(), page, null, opts)).toEqual([]);
    expect(verifyDraft(draft({ observedAt: '2026-07-01' }), { ...page, publishedAt: '2026-07-02' }, null, opts)).toEqual([
      'older than 90 days',
    ]);
  });

  it('always sends a first claim to review', () => {
    expect(needsReview(draft(), null, { terms: ['CPC'] })).toBe('first claim for this asset');
  });
});

describe('needsReview', () => {
  const terms = { terms: ['Caspian Pipeline Consortium', 'loading plan'] };
  const trustedDomains = ['reuters.com', 'gov'];
  it('lets confirmations through when the quote names the asset, from any domain', () => {
    expect(needsReview(draft(), claim('operating', '2026-09-30'), terms)).toBeNull();
    expect(needsReview(draft({ url: 'https://example.com/a' }), claim('operating', '2026-09-30'), terms)).toBeNull();
    expect(needsReview(draft(), claim('operating', '2026-09-30'), { terms: ['Blue Stream'] })).toBe("the quote doesn't name the asset");
    expect(isTrusted('https://www.eia.gov/todayinenergy/', trustedDomains)).toBe(true);
    expect(isTrusted('https://notreuters.com/x', trustedDomains)).toBe(false);
  });

  it('sends status changes to review', () => {
    expect(needsReview(draft(), claim('idle', '2026-09-30'), terms)).toBe('status changes from idle to operating');
  });

  it('marks a confirmation from a domain off the trusted list as unreviewed', () => {
    expect(claimUnreviewed(draft(), trustedDomains)).toBe(false);
    expect(claimUnreviewed(draft({ url: 'https://example.com/a' }), trustedDomains)).toBe(true);
    expect(toEvidence(draft(), '2026-10-29', true).unreviewed).toBe(true);
    expect(toEvidence(draft(), '2026-10-29')).not.toHaveProperty('unreviewed');
  });
});

describe('assetTerms', () => {
  it('splits display names into the names an asset goes by', () => {
    expect(assetTerms('Arab Gas Pipeline · Egypt–Jordan (Arish–Aqaba)', ['Arish–Aqaba', 'EMG'])).toEqual([
      'Arab Gas Pipeline',
      'Egypt–Jordan',
      'Arish–Aqaba',
      'EMG',
    ]);
  });
});

describe('toEvidence and addEvidence', () => {
  it('records the draft in house style, newest first', () => {
    const evidence = toEvidence(draft({ statement: 'Exports hold — sources say (Reuters).' }), '2026-10-29');
    expect(tidyStatement('a — b')).toBe('a, b');
    expect(evidence).toMatchObject({ statement: 'Exports hold, sources say (Reuters).', recordedAt: '2026-10-29', observedAt: '2026-10-28' });
    const records = addEvidence([{ id: 'cpc', evidence: [claim('operating', '2026-09-30')] }], 'cpc', evidence);
    expect(records[0]?.evidence.map((e) => e.observedAt)).toEqual(['2026-10-28', '2026-09-30']);
    expect(() => addEvidence(records, 'nope', evidence)).toThrow(/no curated record nope/);
  });
});

describe('apiFailure', () => {
  const credit = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';

  it('fails the run when the account is refused, even if some calls got through', () => {
    expect(apiFailure([{ outcome: 'committed' }, { outcome: 'error', detail: credit }], { input: 5000 })).toMatch(/refused the account/);
  });

  it('fails the run when every call errored, and not when some were answered', () => {
    expect(apiFailure([{ outcome: 'error', detail: '529 overloaded' }], { input: 0 })).toMatch(/Every call/);
    expect(apiFailure([{ outcome: 'error', detail: '529 overloaded' }, { outcome: 'nothing' }], { input: 1200 })).toBeNull();
  });

  it('passes a quiet run that made no calls', () => {
    expect(apiFailure([{ outcome: 'nothing', detail: 'headlines only' }], { input: 0 })).toBeNull();
  });
});
