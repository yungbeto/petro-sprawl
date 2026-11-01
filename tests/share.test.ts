import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { GLOBE, SHARE } from '../src/lib/config';
import { cellIndex } from '../src/lib/globe';
import {
  escapeHtml,
  lineCells,
  pointCells,
  polygonCells,
  polygonCenter,
  shareCards,
  shareDescription,
  shareFile,
  shareKeys,
  withRing,
  withShareTags,
} from '../src/lib/share';
import type { CountryCrudeImports } from '../src/types';
import { basin, chokepoint, lngTerminal, oilTerminal, pipeline } from './fixtures';

const cell = GLOBE.maskCell;

describe('share keys', () => {
  it('a link to Home has no card; a surface has its own', () => {
    expect(shareFile(null, null)).toBeNull();
    expect(shareKeys(null, null)).toEqual([]);
    expect(shareFile(null, 'pipelines')).toBe('view');
    expect(shareKeys(null, 'pipelines')).toEqual(['pipelines']);
  });

  it('a country tries its surface first; a region its fuel, gasoline being the plain key', () => {
    const us = { kind: 'country' as const, id: 'us' };
    expect(shareFile(us, 'origins')).toBe('country');
    expect(shareKeys(us, 'origins')).toEqual(['country/us@origins', 'country/us']);
    expect(shareKeys(us, null)).toEqual(['country/us']);
    const midwest = { kind: 'region' as const, id: 'padd-2' };
    expect(shareKeys(midwest, 'origins', 'crude')).toEqual(['region/padd-2@crude', 'region/padd-2']);
    expect(shareKeys(midwest, null, 'gasoline')).toEqual(['region/padd-2']);
    expect(shareKeys({ kind: 'pipeline', id: 'x' }, 'pipelines')).toEqual(['pipeline/x']);
  });
});

describe('globe cells', () => {
  it('a point lights a ring of cells around it, and only near it', () => {
    const cells = pointCells([50, 26]);
    expect(cells).toContain(cellIndex(cell, 26, 50));
    expect(cells).toContain(cellIndex(cell, 26, 50 + SHARE.pointRadiusDeg - 1));
    expect(cells).not.toContain(cellIndex(cell, 26, 50 + SHARE.pointRadiusDeg * 2));
  });

  it('a line lights the cells along it', () => {
    const cells = lineCells({ type: 'LineString', coordinates: [[0, 1], [10, 1]] });
    for (const lon of [0.5, 3, 5, 9.5]) expect(cells).toContain(cellIndex(cell, 1, lon));
    expect(cells).not.toContain(cellIndex(cell, 5, 5));
  });

  it('a shape lights the cells whose centre is inside it', () => {
    const cells = polygonCells(basin.geometry as Parameters<typeof polygonCells>[0]);
    expect(cells).toHaveLength(25);
    expect(cells).toContain(cellIndex(cell, 5, 5));
    expect(cells).not.toContain(cellIndex(cell, 11, 5));
  });

  it('something too small to show gets the ring around its centre', () => {
    const tiny = [cellIndex(cell, 25, 51)];
    expect(withRing(tiny, [51, 25]).length).toBeGreaterThanOrEqual(SHARE.minCells);
    const big = Array.from({ length: SHARE.minCells }, (_, i) => i);
    expect(withRing(big, [0, 0])).toBe(big);
  });

  it('a country centres on its largest part', () => {
    const lower48: [number, number][] = [[-125, 25], [-67, 25], [-67, 49], [-125, 49], [-125, 25]];
    const alaska: [number, number][] = [[-168, 55], [-141, 55], [-141, 71], [-168, 71], [-168, 55]];
    expect(polygonCenter({ type: 'MultiPolygon', coordinates: [[alaska], [lower48]] })).toEqual([-96, 37]);
  });
});

describe('shareCards', () => {
  const imports: CountryCrudeImports = {
    id: 'DE',
    iso3: 'DEU',
    source: 'eurostat',
    basis: 'weight',
    unit: 'thousand tonnes',
    from: '2025-09',
    to: '2026-08',
    monthsReported: 12,
    total: 100,
    partners: [
      { iso2: 'NO', iso3: 'NOR', label: 'Norway', value: 40 },
      { iso2: 'US', iso3: 'USA', label: 'United States', value: 30 },
      { iso2: 'KZ', iso3: 'KAZ', label: 'Kazakhstan', value: 20 },
      { iso2: 'LY', iso3: 'LBY', label: 'Libya', value: 10 },
    ],
    importsUsd: null,
    retrieved: '2026-11-01',
  };
  const data: Datasets = {
    ...EMPTY_DATASETS,
    basins: [basin],
    chokepoints: [chokepoint('hormuz', [56.3, 26.6])],
    pipelines: [
      pipeline({
        capacity: { value: 55, unit: 'bcm/yr' },
        transitCountries: ['PL'],
        evidence: [{ status: 'offline', sourceType: 'press', url: 'https://www.example.com/a', observedAt: '2026-10-01', recordedAt: '2026-10-02' }],
      }),
    ],
    lngTerminals: [lngTerminal()],
    oilTerminals: [oilTerminal()],
    countries: [{ id: 'DE', name: 'Germany', geometry: { type: 'Polygon', coordinates: [[[6, 47], [15, 47], [15, 55], [6, 55], [6, 47]]] } }],
    crudeImports: [imports],
  };
  const cards = shareCards(data);

  it('a pipeline: its kind, route, status and capacity, and where the status comes from', () => {
    expect(cards.pipeline['pipeline/test-line']).toMatchObject({
      kicker: 'Gas pipeline',
      title: 'Test line',
      facts: ['Russia → Poland → Germany', 'Offline, 55 bcm/yr capacity'],
      source: 'Status per example.com, 2026-10-01',
      center: [5, 5],
    });
  });

  it('a chokepoint with no transits loaded states no figures', () => {
    expect(cards.chokepoint['chokepoint/hormuz']).toMatchObject({ kicker: 'Chokepoint', facts: [], source: null });
  });

  it('terminals and basins say where they are', () => {
    expect(cards.lng['lng/gem-t1-export']!.facts).toEqual(['Qatar', 'Operating, 10.0 Mtpa operating']);
    expect(cards.terminal['terminal/test-terminal']).toMatchObject({ facts: ['Saudi Arabia', 'Unknown'], source: 'No sourced status yet' });
    expect(cards.basin['basin/usgs-1']).toMatchObject({ facts: ['Saudi Arabia', 'Mostly oil'], source: 'USGS World Petroleum Assessment 2000' });
  });

  it('a country on oil origins names its largest sources, with the source and period', () => {
    expect(cards.country['country/de@origins']).toMatchObject({
      kicker: 'Oil origins',
      title: 'Germany',
      facts: ['Largest crude sources: Norway 40%, United States 30%, Kazakhstan 20%'],
      source: 'Eurostat, 2025-09 to 2026-08',
    });
    // No storage series here, so the plain link shows the imports too.
    expect(cards.country['country/de']!.kicker).toBe('Oil origins');
  });

  it('a surface counts what it holds', () => {
    expect(cards.view.pipelines).toMatchObject({ kicker: 'Map', title: 'Pipelines', facts: ['1 oil, gas and products pipelines, with their status and owners'] });
  });
});

describe('page tags', () => {
  const card = { kicker: 'Chokepoint', title: 'Strait of "Hormuz" & <co>', facts: ['2% of the average'], source: 'IMF PortWatch' };
  const html = '<head>\n    <!-- share:start -->\n    <title>Petro Sprawl</title>\n    <!-- share:end -->\n</head>';

  it('replaces the block between the markers, escaping what goes in', () => {
    const out = withShareTags(html, card, { url: 'https://x.app/?sel=a&b', image: 'https://x.app/api/og?sel=a' });
    expect(out).not.toContain('<title>Petro Sprawl</title>');
    expect(out).toContain('<title>Strait of &quot;Hormuz&quot; &amp; &lt;co&gt; · Petro Sprawl</title>');
    expect(out).toContain('<meta property="og:url" content="https://x.app/?sel=a&amp;b" />');
    expect(out).toContain('<meta property="og:description" content="2% of the average. IMF PortWatch." />');
    expect(out).toContain('<!-- share:end -->');
  });

  it('leaves a page without the markers as it is', () => {
    expect(withShareTags('<head></head>', card, { url: 'u', image: 'i' })).toBe('<head></head>');
  });

  it('a card with no facts is described by its kind', () => {
    expect(shareDescription({ kicker: 'Country', facts: [], source: null })).toBe('Country.');
    expect(escapeHtml(`a"b<c>&`)).toBe('a&quot;b&lt;c&gt;&amp;');
  });
});
