import { describe, expect, it } from 'vitest';
import {
  parseCamera,
  parseSelection,
  parseUrlState,
  sameSelection,
  serializeUrlState,
} from '../src/app/urlState';

describe('parseSelection', () => {
  it('parses a known kind and slug id', () => {
    expect(parseSelection('pipeline/nord-stream-1')).toEqual({ kind: 'pipeline', id: 'nord-stream-1' });
    expect(parseSelection('chokepoint/hormuz')).toEqual({ kind: 'chokepoint', id: 'hormuz' });
  });

  it('rejects unknown kinds, bad ids and malformed values', () => {
    expect(parseSelection(null)).toBeNull();
    expect(parseSelection('')).toBeNull();
    expect(parseSelection('pipeline')).toBeNull();
    expect(parseSelection('refinery/x')).toBeNull();
    expect(parseSelection('pipeline/')).toBeNull();
    expect(parseSelection('pipeline/Nord Stream')).toBeNull();
    expect(parseSelection('pipeline/a/b')).toBeNull();
  });
});

describe('parseCamera', () => {
  it('parses lon, lat, zoom', () => {
    expect(parseCamera('25.5,45.25,3.5')).toEqual({ lon: 25.5, lat: 45.25, zoom: 3.5 });
  });

  it('rejects out-of-range, non-numeric and incomplete values', () => {
    expect(parseCamera(null)).toBeNull();
    expect(parseCamera('1,2')).toBeNull();
    expect(parseCamera('1,,3')).toBeNull();
    expect(parseCamera('a,2,3')).toBeNull();
    expect(parseCamera('181,0,3')).toBeNull();
    expect(parseCamera('0,91,3')).toBeNull();
    expect(parseCamera('0,0,25')).toBeNull();
  });
});

describe('serializeUrlState', () => {
  it('round-trips selection and camera', () => {
    const state = {
      selection: { kind: 'basin' as const, id: 'west-siberian' },
      camera: { lon: 30.123456, lat: 50.98765, zoom: 4.256 },
    };
    const search = serializeUrlState(state);
    expect(search).toBe('?sel=basin/west-siberian&at=30.1235,50.9877,4.26');
    expect(parseUrlState(search)).toEqual({
      selection: state.selection,
      filter: null,
      camera: { lon: 30.1235, lat: 50.9877, zoom: 4.26 },
    });
  });

  it('carries a known filter and ignores unknown ones', () => {
    const search = serializeUrlState({ selection: null, filter: 'below-baseline', camera: null });
    expect(search).toBe('?f=below-baseline');
    expect(parseUrlState(search).filter).toBe('below-baseline');
    expect(parseUrlState('?f=nonsense').filter).toBeNull();
    expect(serializeUrlState({ selection: null, filter: null, camera: null }, '?f=gas')).toBe('');
  });

  it('returns an empty string for an empty state', () => {
    expect(serializeUrlState({ selection: null, camera: null })).toBe('');
  });

  it('keeps unrelated params and drops cleared ones', () => {
    const search = serializeUrlState({ selection: null, camera: null }, '?sel=pipeline/x&debug=1');
    expect(search).toBe('?debug=1');
  });
});

describe('sameSelection', () => {
  it('compares by kind and id', () => {
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection({ kind: 'pipeline', id: 'a' }, { kind: 'pipeline', id: 'a' })).toBe(true);
    expect(sameSelection({ kind: 'pipeline', id: 'a' }, { kind: 'basin', id: 'a' })).toBe(false);
    expect(sameSelection({ kind: 'pipeline', id: 'a' }, null)).toBe(false);
  });
});
