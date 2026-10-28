import { useCallback, useEffect, useRef, useState } from 'react';
import { MapView } from '../map/MapView';
import { Panel } from '../panel/Panel';
import { STORAGE_KEYS } from '../lib/config';
import { readStorage, writeStorage } from '../lib/storage';
import { useTheme } from './useTheme';
import { useUrlState } from './useUrlState';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function App() {
  const { selection, back, setCamera, initialCamera } = useUrlState();
  const { preference, setPreference, theme } = useTheme();
  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEYS.panelCollapsed) === '1');
  const searchRef = useRef<HTMLInputElement>(null);
  const [initialCameraOnce] = useState(initialCamera);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      writeStorage(STORAGE_KEYS.panelCollapsed, value ? null : '1');
      return !value;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') (event.target as HTMLElement).blur();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        if (collapsed) toggleCollapsed();
        // Wait a frame so the input exists after expanding.
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (event.key === '[') {
        toggleCollapsed();
      } else if (event.key === 'Escape') {
        back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, collapsed, toggleCollapsed]);

  return (
    <div className="app" data-panel-collapsed={collapsed}>
      <Panel
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        selection={selection}
        onBack={back}
        themePreference={preference}
        onThemePreferenceChange={setPreference}
        searchRef={searchRef}
      />
      <MapView theme={theme} initialCamera={initialCameraOnce} onCameraChange={setCamera} />
    </div>
  );
}
