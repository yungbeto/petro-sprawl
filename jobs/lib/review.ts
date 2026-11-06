// The rolling review pull requests: each workflow keeps one open pull request (news/review, claims/review)
// and rebuilds it from main on every run, with the drafts still waiting on it plus the run's new ones.
// These functions decide which drafts carry over. Pure, so they're tested (tests/review.test.ts).

import type { Disruption, Evidence } from '../../src/types';
import { urlKey } from './claims';
import type { DisruptionDraftRecord } from './news';

export interface ClaimDraftRecord {
  ref: string;
  reason: string;
  evidence: Evidence;
}

/**
 * The disruption drafts for the review pull request: the ones already waiting on it, then this run's,
 * one per link and action (this run's wins). Drops what main has since made moot: a link main already
 * cites, a disruption main no longer has, an end for a disruption main shows as ended, and a new
 * disruption whose id main has taken (the scan published it, or one like it, in the meantime).
 */
export function reviewDisruptionDrafts(
  pending: readonly DisruptionDraftRecord[],
  fresh: readonly DisruptionDraftRecord[],
  main: readonly Disruption[],
): DisruptionDraftRecord[] {
  const cited = new Set(main.flatMap((d) => d.sources.map((s) => urlKey(s.url))));
  const byId = new Map(main.map((d) => [d.id, d]));
  const keep = (d: DisruptionDraftRecord) => {
    if (d.action === 'add_event') {
      // Its source is usually on main already (the scan commits sources); moot once main has the event.
      const target = d.disruptionId ? byId.get(d.disruptionId) : undefined;
      return !!target && !!d.event && !target.endedAt && !target.events?.some((e) => e.at === d.event!.at && urlKey(e.source) === urlKey(d.event!.source));
    }
    if (cited.has(urlKey(d.source.url))) return false;
    if (d.action === 'new_disruption') return !!d.disruption && !byId.has(d.disruption.id);
    const target = d.disruptionId ? byId.get(d.disruptionId) : undefined;
    if (!target) return false;
    return !(d.action === 'end_disruption' && target.endedAt);
  };
  const out = new Map<string, DisruptionDraftRecord>();
  for (const d of [...pending, ...fresh]) if (keep(d)) out.set(`${d.action} ${urlKey(d.source.url)}${d.event ? ` ${d.event.at}` : ''}`, d);
  return [...out.values()];
}

/**
 * The claim drafts for the review pull request: waiting ones, then this run's, one per asset and link
 * (this run's wins). Drops a link main already cites and an asset main no longer lists.
 */
export function reviewClaimDrafts(
  pending: readonly ClaimDraftRecord[],
  fresh: readonly ClaimDraftRecord[],
  { cited, refs }: { cited: ReadonlySet<string>; refs: ReadonlySet<string> },
): ClaimDraftRecord[] {
  const out = new Map<string, ClaimDraftRecord>();
  for (const d of [...pending, ...fresh]) {
    if (!refs.has(d.ref)) continue;
    const key = d.evidence.url ? urlKey(d.evidence.url) : '';
    if (key && cited.has(key)) continue;
    out.set(`${d.ref} ${key}`, d);
  }
  return [...out.values()];
}
