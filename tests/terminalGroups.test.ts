import { describe, expect, it } from 'vitest';
import { lngGroups, oilGroups } from '../src/lib/terminalGroups';
import type { CountryRegion, Evidence } from '../src/types';
import { chokepoint, lngTerminal, oilTerminal } from './fixtures';

const claim = (status: Evidence['status'], sourceType: Evidence['sourceType'] = 'dataset'): Evidence[] => [
  { status, sourceType, observedAt: '2026-01-01', recordedAt: '2026-01-01' },
];
const regions: CountryRegion[] = [
  { id: 'QA', name: 'Qatar', region: 'Middle East & North Africa' },
  { id: 'SA', name: 'Saudi Arabia', region: 'Middle East & North Africa' },
  { id: 'DE', name: 'Germany', region: 'Europe & Central Asia' },
];

describe('lngGroups', () => {
  const terminals = [
    lngTerminal({ id: 'small', name: 'Small', facility: 'export', country: 'QA', capacityMtpa: { operating: 2, planned: 0 }, evidence: claim('operating') }),
    lngTerminal({ id: 'big', name: 'Big', facility: 'export', country: 'QA', capacityMtpa: { operating: 40, planned: 0 }, evidence: claim('reduced') }),
    lngTerminal({ id: 'metered', name: 'Metered', facility: 'import', country: 'DE', capacityMtpa: { operating: 1, planned: 0 }, sendOutSeriesId: 'x', evidence: claim('operating') }),
    lngTerminal({ id: 'plan', name: 'Plan', facility: 'import', country: '', capacityMtpa: { operating: 0, planned: 5 }, evidence: claim('planned') }),
  ];

  it('puts export before import, and researched then larger terminals first', () => {
    const groups = lngGroups(terminals, 'facility', regions);
    expect(groups.map((g) => g.id)).toEqual(['export', 'import']);
    expect(groups[0]!.terminals.map((t) => t.id)).toEqual(['big', 'small']);
    expect(groups[1]!.terminals.map((t) => t.id)).toEqual(['metered', 'plan']);
  });

  it('groups by region with unknown last, and by status in a fixed order', () => {
    expect(lngGroups(terminals, 'region', regions).map((g) => g.label)).toEqual([
      'Middle East and North Africa',
      'Europe and Central Asia',
      'Region unknown',
    ]);
    expect(lngGroups(terminals, 'status', regions).map((g) => g.id)).toEqual(['running', 'unbuilt']);
  });
});

describe('oilGroups', () => {
  const chokepoints = [chokepoint('hormuz', [56, 26]), chokepoint('babelm', [43, 12]), chokepoint('suez', [32, 30])];
  const terminals = [
    oilTerminal({ id: 'ras', name: 'Ras Tanura', country: 'SA', exitVia: ['hormuz'], evidence: claim('operating', 'press') }),
    oilTerminal({ id: 'jua', name: 'Juaymah', country: 'SA', exitVia: ['hormuz'], evidence: [] }),
    oilTerminal({ id: 'yanbu', name: 'Yanbu', country: 'SA', exitVia: ['suez', 'babelm'], evidence: [] }),
    oilTerminal({ id: 'loop', name: 'LOOP', country: 'US', exitVia: [], evidence: [] }),
  ];

  it('groups by the straits a tanker passes, the busiest route first and open sea last', () => {
    const groups = oilGroups(terminals, 'route', regions, chokepoints);
    expect(groups.map((g) => g.id)).toEqual(['hormuz', 'babelm+suez', 'unknown']);
    expect(groups[0]!.terminals.map((t) => t.id)).toEqual(['jua', 'ras']);
    expect(groups[0]!.status.find((s) => s.id === 'unknown')!.count).toBe(1);
    expect(groups[2]!.label).toBe('Open sea, no chokepoint');
  });
});
