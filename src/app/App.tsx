import { useCallback, useEffect, useRef, useState } from 'react';
import { MapView, type FocusRequest } from '../map/MapView';
import { LayerControl } from '../map/LayerControl';
import type { LayerId, LayerVisibility } from '../map/layers';
import { Panel } from '../panel/Panel';
import { STORAGE_KEYS } from '../lib/config';
import { readStorage, writeStorage } from '../lib/storage';
import { useTheme } from './useTheme';
import { useUrlState } from './useUrlState';
import { useDatasets } from './useDatasets';
import { useVisitChanges } from './useVisitChanges';
import type { Selection } from './urlState';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function App() {
  const { selection, select, back, setCamera, initialCamera } = useUrlState();
  const { preference, setPreference, theme } = useTheme();
  const { data, loaded, failed } = useDatasets();
  const visit = useVisitChanges(data, loaded, failed);
  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEYS.panelCollapsed) === '1');
  const [layersOpen, setLayersOpen] = useState(true);
  // Storage fills whole countries, so it starts off unless a shared link selects a country.
  const [visibility, setVisibility] = useState<LayerVisibility>(() => ({
    storage: selection?.kind === 'storage',
    basins: true,
    pipelines: true,
    chokepoints: true,
  }));
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [initialCameraOnce] = useState(initialCamera);

  // A country selected from search or a summary row needs its storage fill visible.
  useEffect(() => {
    if (selection?.kind === 'storage') setVisibility((v) => (v.storage ? v : { ...v, storage: true }));
  }, [selection]);

  const selectAndFocus = useCallback(
    (next: Selection) => {
      select(next);
      setFocus((prev) => ({ selection: next, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [select],
  );

  // A shared link with a selection but no camera: frame the selection once data arrives.
  useEffect(() => {
    if (loaded && selection && !initialCameraOnce) setFocus({ selection, nonce: 1 });
    // Runs once, when data first loads.
  }, [loaded]);

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
      } else if (event.key === 'l' || event.key === 'L') {
        setLayersOpen((open) => !open);
      } else if (event.key === 'Escape') {
        back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, collapsed, toggleCollapsed]);

  const setLayerVisible = useCallback((id: LayerId, visible: boolean) => {
    setVisibility((v) => ({ ...v, [id]: visible }));
  }, []);

  return (
    <div className="app" data-panel-collapsed={collapsed}>
      <Panel
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        selection={selection}
        onSelect={selectAndFocus}
        onBack={back}
        data={data}
        loaded={loaded}
        failed={failed}
        visit={visit}
        themePreference={preference}
        onThemePreferenceChange={setPreference}
        searchRef={searchRef}
      />
      <MapView
        theme={theme}
        initialCamera={initialCameraOnce}
        onCameraChange={setCamera}
        data={data}
        visibility={visibility}
        selection={selection}
        onSelect={selectAndFocus}
        focus={focus}
      >
        <LayerControl
          open={layersOpen}
          onToggleOpen={() => setLayersOpen((open) => !open)}
          visibility={visibility}
          onChange={setLayerVisible}
          counts={{
            storage: data.series.filter((s) => s.metric === 'storage_fill_pct').length,
            basins: data.basins.length,
            pipelines: data.pipelines.length,
            chokepoints: data.chokepoints.length,
          }}
        />
      </MapView>
    </div>
  );
}
