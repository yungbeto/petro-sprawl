import { describe, expect, it } from 'vitest';
import { EMPTY_DATASETS, type Datasets } from '../src/lib/data';
import { homeHeadlines, publisherLabel } from '../src/lib/headlines';
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

describe('publisherLabel', () => {
  it('names a publisher given as a web address by its site', () => {
    expect(publisherLabel('www.shipmanagementinternational.com')).toBe('shipmanagementinternational.com');
    expect(publisherLabel('https://houseofsaud.com/')).toBe('houseofsaud.com');
    expect(publisherLabel('notus.org')).toBe('notus.org');
  });
  it("cuts a site's tagline off its name, keeping the address where the name comes last", () => {
    expect(publisherLabel('ABC News - Breaking News, Latest News and Videos')).toBe('ABC News');
    expect(publisherLabel('Crude Oil Prices Today | OilPrice.com')).toBe('oilprice.com');
  });
  it('leaves names alone', () => {
    expect(publisherLabel('The Jerusalem Post')).toBe('The Jerusalem Post');
    expect(publisherLabel('Laodong.vn ')).toBe('laodong.vn');
    expect(publisherLabel('WSJ')).toBe('WSJ');
  });
});
