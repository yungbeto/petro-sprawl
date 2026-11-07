import { describe, expect, it } from 'vitest';
import { citation, citeUrl } from '../src/lib/cite';

describe('cite this page', () => {
  it('links the production page without the camera', () => {
    expect(citeUrl('?view=chokepoints&sel=chokepoint/hormuz&at=56,26,6')).toBe(
      'https://petrosprawl.fyi/?view=chokepoints&sel=chokepoint/hormuz',
    );
    expect(citeUrl('?at=1,2,3')).toBe('https://petrosprawl.fyi/');
  });

  it('names the site, the page and its kind', () => {
    expect(
      citation({
        title: 'Strait of Hormuz',
        kind: 'Chokepoint',
        url: 'https://petrosprawl.fyi/?sel=chokepoint/hormuz',
      }),
    ).toBe('Petro Sprawl, "Strait of Hormuz" (chokepoint), https://petrosprawl.fyi/?sel=chokepoint/hormuz.');
  });

  it('drops the qualifiers after the kind', () => {
    expect(citation({ title: 'Nord Stream 1', kind: 'Gas pipeline · corridor', url: 'u' })).toContain(
      '"Nord Stream 1" (gas pipeline)',
    );
  });
});
