import { describe, expect, it } from 'vitest';
import { iconCandidates, imageType, siteKey, sitesToFetch } from '../jobs/lib/favicons';
import { NEWS } from '../src/lib/config';

describe('siteKey', () => {
  it('names a site by its lowercase host without www, and nothing else', () => {
    expect(siteKey('WWW.Reuters.com')).toBe('reuters.com');
    expect(siteKey('yna.co.kr')).toBe('yna.co.kr');
    expect(siteKey('localhost')).toBeNull();
    expect(siteKey('../etc/passwd')).toBeNull();
    expect(siteKey('reuters.com/path')).toBeNull();
  });
});

describe('imageType', () => {
  it('reads the type from the first bytes, never from the server', () => {
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('png');
    expect(imageType(new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01]))).toBe('ico');
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(imageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('webp');
    expect(imageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(imageType(new TextEncoder().encode('<!doctype html>'))).toBeNull();
  });
});

describe('iconCandidates', () => {
  it('ranks declared icons nearest 32 px first, then apple-touch-icon, then /favicon.ico, skipping SVG and data URLs', () => {
    const html = `
      <link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
      <link rel="icon" type="image/svg+xml" href="/icon.svg">
      <link rel="icon" href="/big.png" sizes="192x192">
      <link href="https://cdn.site.com/32.png" rel="shortcut icon" sizes="32x32">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="stylesheet" href="/style.css">`;
    expect(iconCandidates(html, 'https://www.site.com/')).toEqual([
      'https://cdn.site.com/32.png',
      'https://www.site.com/big.png',
      'https://www.site.com/apple.png',
      'https://www.site.com/favicon.ico',
    ]);
    expect(iconCandidates('', 'https://site.com/')).toEqual(['https://site.com/favicon.ico']);
  });
});

describe('sitesToFetch', () => {
  it('tries new sites, and sites without an icon again after the retry window, up to the run limit', () => {
    const state = {
      'old.com': { file: 'favicons/old.com.png', checkedAt: '2026-01-01' },
      'none.com': { file: null, checkedAt: '2026-11-01' },
      'stale.com': { file: null, checkedAt: '2026-10-01' },
    };
    expect(sitesToFetch(['new.com', 'old.com', 'none.com', 'stale.com', 'new.com'], state, '2026-11-05')).toEqual(['new.com', 'stale.com']);
    const many = Array.from({ length: NEWS.faviconsPerRun + 5 }, (_, i) => `s${String(i).padStart(3, '0')}.com`);
    expect(sitesToFetch(many, {}, '2026-11-05')).toHaveLength(NEWS.faviconsPerRun);
  });
});
