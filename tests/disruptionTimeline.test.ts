import { describe, expect, it } from 'vitest';
import { disruptionTimeline } from '../src/lib/disruptionTimeline';
import type { Disruption } from '../src/types';

const source = (url: string, publishedAt: string) => ({ publisher: url.toUpperCase(), title: `About ${url}`, url: `https://${url}.test/`, publishedAt });

const disruption = (over: Partial<Disruption> = {}): Disruption => ({
  id: 'x',
  assetKind: 'chokepoint',
  assetId: 'hormuz',
  startedAt: '2026-03',
  cause: 'conflict',
  summary: 'Why.',
  sources: [source('crs', '2026-08-07'), source('news', '2026-11-04'), source('wire', '2026-04-13')],
  recordedAt: '2026-11-06',
  ...over,
});

describe('disruptionTimeline', () => {
  it('lists the sources as reports, newest first, when there are no events', () => {
    expect(disruptionTimeline(disruption()).map((e) => [e.kind, e.at])).toEqual([
      ['report', '2026-11-04'],
      ['report', '2026-08-07'],
      ['report', '2026-04-13'],
    ]);
  });

  it('shows events with their source, and drops the sources they cite as reports', () => {
    const entries = disruptionTimeline(
      disruption({
        events: [
          { at: '2026-04-13', text: 'Blockade begins.', source: 'https://crs.test/' },
          { at: '2026-06-17', text: 'Memorandum signed.', source: 'https://crs.test/' },
        ],
      }),
    );
    expect(entries.map((e) => [e.kind, e.at, e.kind === 'event' ? e.text : e.source.publisher])).toEqual([
      ['report', '2026-11-04', 'NEWS'],
      ['event', '2026-06-17', 'Memorandum signed.'],
      ['event', '2026-04-13', 'Blockade begins.'],
      ['report', '2026-04-13', 'WIRE'],
    ]);
    expect(entries[1]!.source.publisher).toBe('CRS');
  });

  it('puts a month before the days in it, and skips an event whose source is not listed', () => {
    const entries = disruptionTimeline(
      disruption({
        sources: [source('crs', '2026-08-07'), source('news', '2026-08-05')],
        events: [
          { at: '2026-08', text: 'Blockade back.', source: 'https://crs.test/' },
          { at: '2026-09-01', text: 'Unlisted.', source: 'https://elsewhere.test/' },
        ],
      }),
    );
    expect(entries.map((e) => e.at)).toEqual(['2026-08-05', '2026-08']);
  });
});

describe('disruptionSchema events', () => {
  it("rejects an event that cites a source the disruption doesn't list", async () => {
    const { disruptionSchema } = await import('../jobs/lib/schemas');
    const ok = disruption({ events: [{ at: '2026-04-13', text: 'Blockade begins.', source: 'https://crs.test/' }] });
    expect(disruptionSchema.safeParse(ok).success).toBe(true);
    const bad = disruption({ events: [{ at: '2026-04-13', text: 'Blockade begins.', source: 'https://elsewhere.test/' }] });
    const result = disruptionSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['events', 0, 'source']);
  });
});
