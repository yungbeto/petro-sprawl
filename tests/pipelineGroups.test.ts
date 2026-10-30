import { describe, expect, it } from 'vitest';
import { leadOwner, pipelineGroups } from '../src/lib/pipelineGroups';
import type { CountryRegion, Evidence } from '../src/types';
import { pipeline } from './fixtures';

const claim = (status: Evidence['status']): Evidence[] => [{ status, sourceType: 'dataset', observedAt: '2026-01-01', recordedAt: '2026-01-01' }];
const regions: CountryRegion[] = [
  { id: 'RU', name: 'Russia', region: 'Europe & Central Asia' },
  { id: 'DE', name: 'Germany', region: 'Europe & Central Asia' },
  { id: 'US', name: 'United States', region: 'North America' },
];
const lines = [
  pipeline({ id: 'a', name: 'Alpha', fromCountry: 'US', commodity: 'oil', evidence: claim('operating'), owners: [{ name: 'Acme', sharePct: 100 }] }),
  pipeline({ id: 'b', name: 'Bravo', fromCountry: 'RU', commodity: 'gas', evidence: claim('offline'), owners: [{ name: 'unknown' }] }),
  pipeline({ id: 'c', name: 'Charlie', fromCountry: 'DE', commodity: 'gas', evidence: claim('planned'), sources: ['curated'], owners: [{ name: 'Small', sharePct: 10 }, { name: 'Big', sharePct: 90 }] }),
  pipeline({ id: 'd', name: 'Delta', fromCountry: 'XX', commodity: 'gas', evidence: claim('operating'), parents: [{ name: 'Parent Co' }], owners: [{ name: 'Sub' }] }),
];

describe('pipelineGroups', () => {
  it('groups by the region a line starts in, largest first, unknown last, researched lines first', () => {
    const groups = pipelineGroups(lines, 'region', regions);
    expect(groups.map((g) => g.label)).toEqual(['Europe and Central Asia', 'North America', 'Region unknown']);
    expect(groups[0]!.pipelines.map((p) => p.id)).toEqual(['c', 'b']);
    expect(groups[0]!.status.find((s) => s.id === 'stopped')!.count).toBe(1);
  });

  it('keeps status and commodity in a fixed order', () => {
    expect(pipelineGroups(lines, 'status', regions).map((g) => g.id)).toEqual(['running', 'stopped', 'unbuilt']);
    expect(pipelineGroups(lines, 'commodity', regions).map((g) => g.label)).toEqual(['Gas', 'Crude oil']);
  });

  it('groups by the lead owner, the traced parent first, with unknown owners last', () => {
    expect(leadOwner(lines[2]!)).toBe('Big');
    expect(leadOwner(lines[3]!)).toBe('Parent Co');
    expect(leadOwner(lines[1]!)).toBeNull();
    const groups = pipelineGroups(lines, 'owner', regions);
    expect(groups.at(-1)!.label).toBe('Owner unknown');
    expect(groups.map((g) => g.label)).toContain('Big');
  });
});
