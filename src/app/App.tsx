import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type FocusRequest } from '../map/MapView';
import { LayerControl } from '../map/LayerControl';
import type { LayerId, LayerVisibility } from '../map/layers';
import { Panel, PanelIcon } from '../panel/Panel';
import { Search } from '../panel/Search';
import { FilterChips } from '../map/FilterChips';
import { FILTER_IDS, filterMatches, matchCount, type FilterId, type FilterMatches } from '../lib/filters';
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
  const { selection, select, filter, setFilter, back, setCamera, initialCamera } = useUrlState();
  const { preference, setPreference, theme } = useTheme();
  const { data, loaded, failed } = useDatasets();
  const visit = useVisitChanges(data, loaded, failed);
  // Every visit opens on the summary; minimizing lasts until something is selected.
  const [collapsed, setCollapsed] = useState(false);
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
      setCollapsed(false);
      setFocus((prev) => ({ selection: next, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [select],
  );

  // A shared link with a selection but no camera: frame the selection once data arrives.
  useEffect(() => {
    if (loaded && selection && !initialCameraOnce) setFocus({ selection, nonce: 1 });
    // Runs once, when data first loads.
  }, [loaded]);

  // Every filter's matches up front: the chips show counts, and switching is instant.
  const allMatches = useMemo(() => {
    const now = new Date();
    return Object.fromEntries(FILTER_IDS.map((id) => [id, filterMatches(id, data, now)])) as Record<FilterId, FilterMatches>;
  }, [data]);
  const matches = filter ? allMatches[filter] : null;

  const changeFilter = useCallback(
    (next: FilterId | null) => {
      setFilter(next);
      if (next) setCollapsed(false);
    },
    [setFilter],
  );

  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) {
        if (event.key === 'Escape') (event.target as HTMLElement).blur();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        // The search is there whether the panel is open or minimized.
        searchRef.current?.focus();
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
  }, [back, toggleCollapsed]);

  const setLayerVisible = useCallback((id: LayerId, visible: boolean) => {
    setVisibility((v) => ({ ...v, [id]: visible }));
  }, []);

  return (
    <div className="app" data-panel-collapsed={collapsed}>
      {/* One search bar for both states, floating top left, so it never moves when the panel opens or closes. */}
      <div className="search-bar" role="search">
        {collapsed && (
          <button
            type="button"
            className="icon-button"
            onClick={toggleCollapsed}
            aria-label="Expand panel"
            title="Expand panel  ["
          >
            <PanelIcon />
          </button>
        )}
        <Search data={data} onSelect={selectAndFocus} inputRef={searchRef} />
      </div>
      <FilterChips
        active={filter}
        counts={Object.fromEntries(FILTER_IDS.map((id) => [id, matchCount(allMatches[id])])) as Record<FilterId, number>}
        onChange={changeFilter}
      />
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
        filter={filter}
        matches={matches}
        onClearFilter={() => setFilter(null)}
        themePreference={preference}
        onThemePreferenceChange={setPreference}
      />
      <MapView
        theme={theme}
        initialCamera={initialCameraOnce}
        onCameraChange={setCamera}
        data={data}
        visibility={visibility}
        selection={selection}
        highlight={matches}
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
