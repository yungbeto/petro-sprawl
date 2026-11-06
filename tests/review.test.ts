import { describe, expect, it } from 'vitest';
import { reviewClaimDrafts, reviewDisruptionDrafts, type ClaimDraftRecord } from '../jobs/lib/review';
import type { DisruptionDraftRecord } from '../jobs/lib/news';
import type { Disruption, Evidence } from '../src/types';

const source = (url: string) => ({ publisher: 'Outlet', title: 'Headline', url, publishedAt: '2026-11-04' });

const hormuz: Disruption = {
  id: 'hormuz-2026-iran-restrictions',
  assetKind: 'chokepoint',
  assetId: 'hormuz',
  startedAt: '2026-03',
  cause: 'conflict',
  summary: 'Closed.',
  sources: [source('https://www.reuters.com/a')],
  recordedAt: '2026-03-02',
};
const ended: Disruption = { ...hormuz, id: 'druzhba-2026-08', assetKind: 'pipeline', assetId: 'druzhba', endedAt: '2026-09-01' };
const main = [hormuz, ended];

const addSource = (url: string, disruptionId = hormuz.id): DisruptionDraftRecord => ({
  ref: 'chokepoint/hormuz',
  reason: 'cause changes from conflict to other',
  action: 'add_source',
  disruptionId,
  source: source(url),
});

describe('reviewDisruptionDrafts', () => {
  it('keeps waiting drafts and adds new ones, one per link and action, the newer winning', () => {
    const waiting = addSource('https://gcaptain.com/a');
    const again = { ...addSource('https://www.gcaptain.com/a/'), reason: 'newer' };
    const fresh = addSource('https://arabnews.com/b');
    expect(reviewDisruptionDrafts([waiting], [again, fresh], main)).toEqual([again, fresh]);
  });

  it('drops drafts main has made moot', () => {
    const cited = addSource('https://reuters.com/a');
    const gone = addSource('https://gcaptain.com/a', 'no-such-disruption');
    const endEnded: DisruptionDraftRecord = { ...addSource('https://gcaptain.com/b', ended.id), action: 'end_disruption', endedAt: '2026-09-01' };
    const taken: DisruptionDraftRecord = { ...addSource('https://gcaptain.com/c'), action: 'new_disruption', disruptionId: undefined, disruption: { ...hormuz } };
    const fresh: DisruptionDraftRecord = { ...taken, source: source('https://gcaptain.com/d'), disruption: { ...hormuz, id: 'hormuz-2026-11-05' } };
    expect(reviewDisruptionDrafts([cited, gone, endEnded, taken], [fresh], main)).toEqual([fresh]);
  });

  it('keeps an event whose source main already cites, and drops it once main has the event or the disruption ended', () => {
    const event = (disruptionId = hormuz.id): DisruptionDraftRecord => ({
      ...addSource('https://www.reuters.com/a', disruptionId),
      reason: 'adds a dated event',
      action: 'add_event',
      event: { at: '2026-11-04', text: 'Iran attacks two tankers.', source: 'https://www.reuters.com/a' },
    });
    expect(reviewDisruptionDrafts([], [event()], main)).toEqual([event()]);
    const done = { ...hormuz, events: [{ at: '2026-11-04', text: 'Iran attacks two tankers.', source: 'https://reuters.com/a/' }] };
    expect(reviewDisruptionDrafts([event()], [], [done, ended])).toEqual([]);
    expect(reviewDisruptionDrafts([event(ended.id)], [], main)).toEqual([]);
  });
});

describe('reviewClaimDrafts', () => {
  const evidence = (url: string): Evidence => ({ status: 'unknown', sourceType: 'press', url, observedAt: '2026-11-01', recordedAt: '2026-11-05' });
  const draft = (ref: string, url: string, reason = 'status changes from operating to unknown'): ClaimDraftRecord => ({ ref, reason, evidence: evidence(url) });
  const opts = { cited: new Set(['reuters.com/old']), refs: new Set(['terminal/kharg', 'pipeline/btc']) };

  it('carries waiting drafts over, one per asset and link, the newer winning', () => {
    const waiting = draft('terminal/kharg', 'https://marinelink.com/a');
    const again = draft('terminal/kharg', 'https://www.marinelink.com/a', 'newer');
    const other = draft('pipeline/btc', 'https://marinelink.com/a');
    expect(reviewClaimDrafts([waiting], [again, other], opts)).toEqual([again, other]);
  });

  it('drops a link main already cites and an asset main no longer lists', () => {
    expect(reviewClaimDrafts([draft('terminal/kharg', 'https://www.reuters.com/old/'), draft('terminal/gone', 'https://x.com/a')], [], opts)).toEqual([]);
  });
});
