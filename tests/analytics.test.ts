import { describe, expect, it } from 'vitest';
import { pageviewFilter, pageviewUrl } from '../src/lib/analytics';

describe('pageviewUrl', () => {
  it('drops the camera and keeps the view and selection', () => {
    expect(pageviewUrl('https://petrosprawl.fyi/?at=56.8,26.3,6&view=chokepoints&sel=chokepoint/hormuz')).toBe(
      'https://petrosprawl.fyi/?view=chokepoints&sel=chokepoint%2Fhormuz',
    );
    expect(pageviewUrl('https://petrosprawl.fyi/')).toBe('https://petrosprawl.fyi/');
  });
});

describe('pageviewFilter', () => {
  it('counts a view once however often the map moves, and passes other events through', () => {
    const filter = pageviewFilter();
    const view = (url: string) => filter({ type: 'pageview', url });
    expect(view('https://petrosprawl.fyi/?view=basins')?.url).toBe('https://petrosprawl.fyi/?view=basins');
    expect(view('https://petrosprawl.fyi/?view=basins&at=10,20,3')).toBeNull();
    expect(view('https://petrosprawl.fyi/?at=11,20,3&view=basins')).toBeNull();
    expect(filter({ type: 'event', url: 'https://petrosprawl.fyi/?view=basins' })).not.toBeNull();
    expect(view('https://petrosprawl.fyi/?view=basins&sel=basin/usgs-1174')).not.toBeNull();
    // Back to a view counted earlier, after another, counts again.
    expect(view('https://petrosprawl.fyi/?view=basins')).not.toBeNull();
  });
});
