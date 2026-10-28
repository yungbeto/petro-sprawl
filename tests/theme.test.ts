import { describe, expect, it } from 'vitest';
import { parseThemePreference, resolveTheme } from '../src/lib/theme';

describe('resolveTheme', () => {
  it('follows the system setting by default', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets a manual choice override the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('parseThemePreference', () => {
  it('falls back to system for missing or unknown values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('dark')).toBe('dark');
  });
});
