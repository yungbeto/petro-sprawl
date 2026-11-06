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

describe('dark tokens', () => {
  // The dark values are written twice in tokens.css: once for the system setting, once for a manual choice.
  // A token added to one and not the other shows light colours in dark mode (it did, until 2026-11-05).
  it('are the same for the system setting and a manual choice, and cover every colour token', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    const decls = (block: string) => Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
    const between = (from: string, to?: string) => css.slice(css.indexOf(from), to ? css.indexOf(to, css.indexOf(from)) : undefined);
    const light = decls(between(':root {', '@media'));
    const system = decls(between(":root:not([data-theme='light'])", ":root[data-theme='dark']"));
    const manual = decls(between(":root[data-theme='dark']"));
    expect(manual).toEqual(system);
    const themed = Object.keys(system);
    const colours = Object.keys(light).filter((k) => /^#|^rgb|^url|gradient/.test(light[k]!) && !k.startsWith('--shadow-md'));
    expect(colours.filter((k) => !themed.includes(k))).toEqual([]);
  });
});
