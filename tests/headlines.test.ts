import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { homeHeadlines } from '../src/lib/headlines';
import type { NewsHeadline } from '../src/types';

const headline = (title: string, refs: string[]): NewsHeadline => ({
  title,
  publisher: 'Reuters',
  url: `https://example.com/${encodeURIComponent(title)}`,
  publishedAt: '2026-11-03',
  feed: 'gdelt',
  refs,
});

const data = {
  ...EMPTY_DATASETS,
  chokepoints: [{ id: 'hormuz', name: 'Strait of Hormuz' }],
  oilTerminals: [{ id: 'kharg', name: 'Kharg Island' }],
  newsHeadlines: [
    headline('Oil rises after report of US strike on Qeshm', ['chokepoint/hormuz']),
    headline('A pipeline nobody mapped', ['pipeline/unknown']),
    headline('Tankers wait off Kharg as Hormuz traffic slows', ['terminal/kharg', 'chokepoint/hormuz']),
  ],
} as unknown as Datasets;

describe('homeHeadlines', () => {
  it('names the assets each headline mentions, and leaves out headlines that name none on the map', () => {
    const rows = homeHeadlines(data);
    expect(rows.map((r) => r.headline.title)).toEqual([
      'Oil rises after report of US strike on Qeshm',
      'Tankers wait off Kharg as Hormuz traffic slows',
    ]);
    expect(rows[1]!.assets).toEqual([
      { selection: { kind: 'terminal', id: 'kharg' }, name: 'Kharg Island' },
      { selection: { kind: 'chokepoint', id: 'hormuz' }, name: 'Strait of Hormuz' },
    ]);
  });

  it('shows at most the limit', () => {
    expect(homeHeadlines(data, 1)).toHaveLength(1);
  });
});
