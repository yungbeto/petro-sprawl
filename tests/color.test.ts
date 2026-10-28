import { describe, expect, it } from 'vitest';
import { parseHexColor, withAlpha } from '../src/lib/color';

describe('parseHexColor', () => {
  it('parses 3, 6 and 8 digit hex', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseHexColor(' #1d7a4b ')).toEqual([29, 122, 75, 255]);
    expect(parseHexColor('#6d6a5c73')).toEqual([109, 106, 92, 115]);
  });

  it('rejects anything else', () => {
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor('rgb(0,0,0)')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
  });
});

describe('withAlpha', () => {
  it('scales alpha', () => {
    expect(withAlpha([1, 2, 3, 200], 0.5)).toEqual([1, 2, 3, 100]);
  });
});
