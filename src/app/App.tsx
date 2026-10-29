import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type FocusRequest } from '../map/MapView';
import { LayerControl } from '../map/LayerControl';
import type { LayerId, LayerVisibility } from '../map/layers';
import { Panel, PanelIcon } from '../panel/Panel';
import { Search } from '../panel/Search';
import { FilterChips } from '../map/FilterChips';
import { FILTER_IDS, FILTER_LABELS, filterMatches, matchCount, type FilterId, type FilterMatches } from '../lib/filters';
import { useTheme } from './useTheme';
import { useNow } from './useNow';
import { AppMenu, type MenuSection } from './AppMenu';
import { datasetFreshness, sortFreshness } from '../lib/freshness';
import { useUrlState } from './useUrlState';
import { useDatasets } from './useDatasets';
import { resolveSelection } from '../lib/data';
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
  const [layersOpen, setLayersOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);
  // Storage fills whole countries, so it starts off unless a shared link selects a country.
  const [visibility, setVisibility] = useState<LayerVisibility>(() => ({
    storage: selection?.kind === 'storage',
    basins: true,
    pipelines: true,
    lng: true,
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

  // The search bar shows what the panel shows: the selection's name, or the active filter's.
  const searchContext = selection
    ? (resolveSelection(selection, data)?.item.name ?? null)
    : filter
      ? FILTER_LABELS[filter]
      : null;

  const changeFilter = useCallback(
    (next: FilterId | null) => {
      setFilter(next);
      if (next) setCollapsed(false);
    },
    [setFilter],
  );

  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);

  // The app menu: open (optionally at a section) or closed. Focus returns to its button on close.
  const [menu, setMenu] = useState<{ section: MenuSection | null } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // After the menu closes and the page is no longer inert, focus goes back to the menu button.
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (!menu && menuWasOpen.current) menuButtonRef.current?.focus();
    menuWasOpen.current = menu !== null;
  }, [menu]);
  const now = useNow();
  const freshness = sortFreshness(data.meta.map((m) => datasetFreshness(m, now)));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // With the menu open, Esc closes it and the map's shortcuts wait.
      if (menu) {
        if (event.key === 'Escape') closeMenu();
        return;
      }
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
        // An open layer list closes before the panel steps back.
        if (layersOpen) setLayersOpen(false);
        else back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, toggleCollapsed, menu, closeMenu, layersOpen]);

  const setLayerVisible = useCallback((id: LayerId, visible: boolean) => {
    setVisibility((v) => ({ ...v, [id]: visible }));
  }, []);

  return (
    <div className="app" data-panel-collapsed={collapsed}>
      {/* Everything but the menu; inert while the menu is open, so focus and clicks stay in it. */}
      <div className="app__content" inert={menu !== null}>
        {/* One search bar for both states, floating top left, so it never moves when the panel opens or closes. */}
        <div className="search-bar" role="search">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-button"
            onClick={() => setMenu({ section: null })}
            aria-label="Menu"
            aria-haspopup="dialog"
            title="Menu"
          >
            <MenuIcon />
          </button>
          <Search data={data} onSelect={selectAndFocus} inputRef={searchRef} context={searchContext} onClose={back} />
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
            data={data}
          loaded={loaded}
          failed={failed}
          visit={visit}
          filter={filter}
          matches={matches}
            freshness={freshness}
          now={now}
          onOpenMenu={(section) => setMenu({ section })}
          onFilter={changeFilter}
          onShowStorage={() => setLayerVisible('storage', true)}
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
            onClose={closeLayers}
            visibility={visibility}
            onChange={setLayerVisible}
            counts={{
              storage: data.series.filter((s) => s.metric === 'storage_fill_pct').length,
              basins: data.basins.length,
              pipelines: data.pipelines.length,
              lng: data.lngTerminals.length,
              chokepoints: data.chokepoints.length,
            }}
          />
        </MapView>
      </div>
      {menu && (
        <AppMenu
          onClose={closeMenu}
          section={menu.section}
          data={data}
          freshness={freshness}
          now={now}
          themePreference={preference}
          onThemePreferenceChange={setPreference}
        />
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
