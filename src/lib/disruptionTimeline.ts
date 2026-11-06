// A disruption's timeline (2026-11-06): its curated events, each with the source it comes from, and the
// sources no event cites, as dated reports. Newest first; on the same date an event comes before a report.
// A month-only date sorts before the days in that month.

import type { Disruption, SourceRef } from '../types';

export type TimelineEntry =
  | { kind: 'event'; at: string; text: string; source: SourceRef }
  | { kind: 'report'; at: string; source: SourceRef };

export function disruptionTimeline(d: Disruption): TimelineEntry[] {
  const byUrl = new Map(d.sources.map((s) => [s.url, s]));
  const events: TimelineEntry[] = (d.events ?? []).flatMap((e) => {
    const source = byUrl.get(e.source);
    // build:curated rejects an event without a listed source; this keeps a bad file from drawing one.
    return source ? [{ kind: 'event' as const, at: e.at, text: e.text, source }] : [];
  });
  const cited = new Set(events.map((e) => e.source.url));
  const reports: TimelineEntry[] = d.sources.filter((s) => !cited.has(s.url)).map((s) => ({ kind: 'report', at: s.publishedAt, source: s }));
  return [...events, ...reports].sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1));
}
