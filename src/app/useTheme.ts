import { useEffect, useLayoutEffect, useState } from 'react';
import { STORAGE_KEYS } from '../lib/config';
import { readStorage, writeStorage } from '../lib/storage';
import { parseThemePreference, resolveTheme, type ThemePreference } from '../lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    parseThemePreference(readStorage(STORAGE_KEYS.theme)),
  );
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Layout effect so the tokens are in place before the map reads them in a passive effect.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = preference;
    writeStorage(STORAGE_KEYS.theme, preference === 'system' ? null : preference);
  }, [preference]);

  return { preference, setPreference, theme: resolveTheme(preference, systemDark) };
}
