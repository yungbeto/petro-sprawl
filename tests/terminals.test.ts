import { describe, expect, it } from 'vitest';
import { prepareTerminals } from '../jobs/lib/curated-terminals';
import { EMPTY_DATASETS, pipelineDisruptions, terminalsForPipeline, terminalsViaChokepoint } from '../src/lib/data';
import { terminalStatus } from '../src/lib/encoding';
import { filterMatches } from '../src/lib/filters';
import { buildSearchIndex, search } from '../src/lib/search';
import type { Disruption, Evidence } from '../src/types';
import { oilTerminal, pipeline } from './fixtures';

const claim = (status: Evidence['status'], observedAt: string): Evidence => ({
  status,
  sourceType: 'press',
  statement: 'x',
  url: 'https://example.com',
  observedAt,
  recordedAt: observedAt,
});

const disruption = (id: string, assetKind: Disruption['assetKind'], assetId: string, startedAt: string): Disruption => ({
  id,
  assetKind,
  assetId,
  startedAt,
  cause: 'conflict',
  summary: 'x',
  sources: [{ publisher: 'P', title: 'T', url: 'https://example.com', publishedAt: startedAt }],
  recordedAt: startedAt,
});

const data = {
  ...EMPTY_DATASETS,
  pipelines: [pipeline({ id: 'bps-1', name: 'BPS-1', commodity: 'oil' })],
  oilTerminals: [
    oilTerminal({ id: 'primorsk', name: 'Primorsk', pipelineIds: ['bps-1'], exitVia: ['danish'], evidence: [claim('operating', '2026-10-20')] }),
    oilTerminal({ id: 'kharg', name: 'Kharg Island', aliases: ['Kharg'], exitVia: ['hormuz'], evidence: [claim('offline', '2026-03-01')] }),
    oilTerminal({ id: 'juaymah', name: "Ras al-Ju'aymah", exitVia: ['hormuz'] }),
  ],
  disruptions: [
    disruption('line', 'pipeline', 'bps-1', '2026-01'),
    disruption('port', 'terminal', 'primorsk', '2026-03'),
    disruption('other', 'terminal', 'kharg', '2026-07-18'),
  ],
};

describe('prepareTerminals', () => {
  it('orders evidence newest first', () => {
    const [t] = prepareTerminals([oilTerminal({ evidence: [claim('offline', '2026-07-25'), claim('reduced', '2026-08-28')] })], new Set(), []);
    expect(t?.evidence.map((e) => e.observedAt)).toEqual(['2026-08-28', '2026-07-25']);
  });

  it('refuses links to pipelines or terminals that do not exist', () => {
    expect(() => prepareTerminals([oilTerminal({ pipelineIds: ['nope'] })], new Set(['bps-1']), [])).toThrow(/test-terminal links pipeline nope/);
    expect(() => prepareTerminals([oilTerminal()], new Set(), [disruption('d', 'terminal', 'gone', '2026-01')])).toThrow(/d names terminal gone/);
  });
});

describe('terminal relations', () => {
  it('finds terminals by pipeline and by the chokepoint their tankers pass', () => {
    expect(terminalsForPipeline(data, 'bps-1').map((t) => t.id)).toEqual(['primorsk']);
    expect(terminalsViaChokepoint(data, 'hormuz').map((t) => t.id)).toEqual(['kharg', 'juaymah']);
  });

  it("shows a pipeline's own disruptions and those at its terminals, newest first", () => {
    expect(pipelineDisruptions(data, 'bps-1').map((d) => d.id)).toEqual(['port', 'line']);
  });

  it('takes status from the newest claim, unknown without one', () => {
    expect(data.oilTerminals.map(terminalStatus)).toEqual(['operating', 'offline', 'unknown']);
  });
});

describe('terminals in filters and search', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  it('matches offline, oil and unverified terminals', () => {
    expect([...filterMatches('offline', data, now).terminals]).toEqual(['kharg']);
    expect(filterMatches('oil', data, now).terminals.size).toBe(3);
    expect([...filterMatches('unverified', data, now).terminals]).toEqual(['kharg']);
    expect(filterMatches('gas', data, now).terminals.size).toBe(0);
  });

  it('finds a terminal by an alias', () => {
    expect(search(buildSearchIndex(data), 'kharg')[0]?.selection).toEqual({ kind: 'terminal', id: 'kharg' });
  });
});
