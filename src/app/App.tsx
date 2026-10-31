import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type FocusRequest } from '../map/MapView';
import { LayerControl } from '../map/LayerControl';
import type { LayerId, LayerVisibility } from '../map/layers';
import { CaretRightIcon, GearIcon, HouseIcon, LightbulbIcon, ListIcon, QuestionIcon } from '@phosphor-icons/react';
import { VIEW_ICONS } from './viewIcons';
import { pipelineGroups, type PipelineGrouping } from '../lib/pipelineGroups';
import { lngGroups, oilGroups, type TerminalGrouping, type TerminalKind } from '../lib/terminalGroups';
import type { TerminalListing } from '../panel/TerminalsView';
import type { Pipeline } from '../types';
import { Panel } from '../panel/Panel';
import { SearchBar, SearchDialog } from '../panel/Search';
import { FilterChips } from '../map/FilterChips';
import { FILTER_IDS, FILTER_LABELS, filterMatches, matchCount, type FilterId, type FilterMatches } from '../lib/filters';
import { useTheme } from './useTheme';
import { useNow } from './useNow';
import { AppMenu, type MenuSection } from './AppMenu';
import { datasetFreshness, sortFreshness } from '../lib/freshness';
import { useUrlState } from './useUrlState';
import { DEFAULT_REGION_FUEL, type RegionFuel } from '../lib/config';
import type { SearchScope } from '../lib/search';
import { useDatasets } from './useDatasets';
import { resolveSelection } from '../lib/data';
import { SURFACE_FILTERS, VIEW_IDS, VIEW_LABELS, scopeMatches, viewHighlight, viewPoints, type ViewId } from '../lib/views';
import { useVisitChanges } from './useVisitChanges';
import { useIsPhone, useSheet } from './useSheet';
import type { Selection } from './urlState';

/** Each line's two ends: enough to frame a group of pipelines without walking every vertex. */
function lineEnds(pipelines: Pipeline[]): [number, number][] {
  return pipelines.flatMap((p) => {
    const parts = p.geometry.type === 'LineString' ? [p.geometry.coordinates] : p.geometry.coordinates;
    return parts.flatMap((part) => [part[0], part.at(-1)].filter(Boolean).map((c) => [c![0]!, c![1]!] as [number, number]));
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function App() {
  const { from, view, setView, selection, select, fuel, setFuel, filter, setFilter, back, setCamera, initialCamera } = useUrlState();
  const { preference, setPreference, theme } = useTheme();
  const { data, loaded, failed } = useDatasets();
  const visit = useVisitChanges(data, loaded, failed);
  // Every visit opens on the summary; minimizing lasts until something is selected.
  const [collapsed, setCollapsed] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);
  // Storage fills whole countries, so it starts off unless a shared link selects a country.
  const [visibility, setVisibility] = useState<LayerVisibility>(() => ({
    storage: selection?.kind === 'storage' || view === 'storage',
    basins: true,
    pipelines: true,
    lng: true,
    terminals: true,
    chokepoints: true,
  }));
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  // Phones: the panel is a bottom sheet over a full-screen map, and the rail a tab bar.
  const phone = useIsPhone();
  const sheet = useSheet(phone, appRef);
  const { detent: sheetDetent, setDetent: setSheetDetent } = sheet;
  // The open search's starting scope, or null while it's closed.
  const [searchScope, setSearchScope] = useState<SearchScope | null>(null);
  const searchOpen = searchScope !== null;
  const [initialCameraOnce] = useState(initialCamera);

  // A country selected from search or a list, or the storage surface, needs the storage fill visible.
  useEffect(() => {
    if (selection?.kind === 'storage' || view === 'storage') setVisibility((v) => (v.storage ? v : { ...v, storage: true }));
  }, [selection, view]);

  const selectAndFocus = useCallback(
    (next: Selection, nextFuel?: RegionFuel) => {
      select(next, nextFuel);
      setCollapsed(false);
      setFocus((prev) => ({ selection: next, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [select],
  );

  // A shared link with a selection but no camera: frame the selection once data arrives.
  useEffect(() => {
    if (loaded && !initialCameraOnce) {
      if (selection) setFocus({ selection, nonce: 1 });
      else if (view) setFocus({ points: viewPoints(view, data), nonce: 1 });
    }
    // Runs once, when data first loads.
  }, [loaded]);

  // Every filter's matches up front: the chips show counts, and switching is instant.
  const allMatches = useMemo(() => {
    const now = new Date();
    return Object.fromEntries(FILTER_IDS.map((id) => [id, filterMatches(id, data, now)])) as Record<FilterId, FilterMatches>;
  }, [data]);
  // Chips belong to the surface: each counts and matches within it only.
  const surfaceFilters = SURFACE_FILTERS[view ?? 'home'];
  const surfaceMatches = useMemo(
    () => Object.fromEntries(FILTER_IDS.map((id) => [id, scopeMatches(allMatches[id], view, data)])) as Record<FilterId, FilterMatches>,
    [allMatches, view, data],
  );
  const matches = filter ? surfaceMatches[filter] : null;

  // The pipelines surface's grouping and open group live here, so they survive opening a pipeline and coming back.
  const [pipelineGrouping, setPipelineGrouping] = useState<PipelineGrouping>('region');
  const [openPipelineGroup, setOpenPipelineGroup] = useState<string | null>(null);
  const pipelineGroupList = useMemo(
    () => (view === 'pipelines' ? pipelineGroups(data.pipelines, pipelineGrouping, data.countryRegions) : []),
    [view, data, pipelineGrouping],
  );
  const openGroup = pipelineGroupList.find((g) => g.id === openPipelineGroup) ?? null;

  // The fuel origins surface's fuel, apart from the region view's own `fuel=`.
  const [originsFuel, setOriginsFuel] = useState<RegionFuel>(DEFAULT_REGION_FUEL);

  // The terminals surface's kind, a grouping per kind, and the open group, kept the same way.
  const [terminalKind, setTerminalKind] = useState<TerminalKind>('lng');
  const [terminalGrouping, setTerminalGrouping] = useState<Record<TerminalKind, TerminalGrouping>>({ lng: 'facility', oil: 'route' });
  const [openTerminalGroup, setOpenTerminalGroup] = useState<string | null>(null);
  const terminalListing = useMemo((): TerminalListing => {
    if (view !== 'terminals') return { kind: terminalKind, groups: [] } as TerminalListing;
    const by = terminalGrouping[terminalKind];
    return terminalKind === 'lng'
      ? { kind: 'lng', groups: lngGroups(data.lngTerminals, by, data.countryRegions) }
      : { kind: 'oil', groups: oilGroups(data.oilTerminals, by, data.countryRegions, data.chokepoints) };
  }, [view, data, terminalKind, terminalGrouping]);
  const openTerminals = useMemo(() => {
    const group = (terminalListing.groups as { id: string; terminals: { id: string; point: [number, number] }[] }[]).find(
      (g) => g.id === openTerminalGroup,
    );
    return group?.terminals ?? null;
  }, [terminalListing, openTerminalGroup]);

  const groupMatches = useMemo((): FilterMatches | null => {
    const none = () => new Set<string>();
    if (openGroup) return { pipelines: new Set(openGroup.pipelines.map((p) => p.id)), chokepoints: none(), lng: none(), terminals: none() };
    if (view !== 'terminals') return null;
    // The kind switch keeps its own kind bright; an open group narrows that to the group.
    const ids = new Set(
      openTerminals ? openTerminals.map((t) => t.id) : (terminalKind === 'lng' ? data.lngTerminals : data.oilTerminals).map((t) => t.id),
    );
    return { pipelines: none(), chokepoints: none(), lng: terminalKind === 'lng' ? ids : none(), terminals: terminalKind === 'oil' ? ids : none() };
  }, [openGroup, view, openTerminals, terminalKind, data]);

  // Fuel origins shows only the regions: on its own page, and on a region opened from anywhere. Opening
  // anything else from the surface brings the other layers back.
  const regionsOnly = selection ? selection.kind === 'region' : view === 'origins';

  // A filter narrows the map; otherwise an open group, otherwise the open view, sets what stays bright.
  const viewMatches = useMemo(() => (view ? viewHighlight(view, data) : null), [view, data]);
  const highlight = matches ?? groupMatches ?? viewMatches;

  // The panel's top bar: Back names the item or list this one was opened from, within the same
  // surface; Close returns to the surface's own page (the summary, or the view's list).
  const surfaceLabel = view ? VIEW_LABELS[view] : 'Home';
  const backLabel =
    from && from.view === view && (from.selection || from.filter)
      ? from.selection
        ? (resolveSelection(from.selection, data)?.item.name ?? null)
        : FILTER_LABELS[from.filter!]
      : null;

  const changeFilter = useCallback(
    (next: FilterId | null) => {
      setFilter(next);
      if (next) setCollapsed(false);
    },
    [setFilter],
  );

  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);

  // The rail: Home (the summary) or a view. A view stays lit while you open things from it, and
  // pressing it again returns to its list. Opening one reopens a minimized panel.
  const changePipelineGrouping = useCallback((next: PipelineGrouping) => {
    setPipelineGrouping(next);
    setOpenPipelineGroup(null);
  }, []);
  // Opening a group frames its pipelines; closing it leaves the camera where it is.
  const togglePipelineGroup = useCallback(
    (id: string) => {
      const opening = openPipelineGroup !== id;
      setOpenPipelineGroup(opening ? id : null);
      const group = pipelineGroupList.find((g) => g.id === id);
      if (opening && group) setFocus((prev) => ({ points: lineEnds(group.pipelines), nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [openPipelineGroup, pipelineGroupList],
  );

  const changeTerminalKind = useCallback((next: TerminalKind) => {
    setTerminalKind(next);
    setOpenTerminalGroup(null);
  }, []);
  const changeTerminalGrouping = useCallback(
    (next: TerminalGrouping) => {
      setTerminalGrouping((prev) => ({ ...prev, [terminalKind]: next }));
      setOpenTerminalGroup(null);
    },
    [terminalKind],
  );
  // Opening a group frames its terminals.
  const toggleTerminalGroup = useCallback(
    (id: string) => {
      const opening = openTerminalGroup !== id;
      setOpenTerminalGroup(opening ? id : null);
      const group = (terminalListing.groups as { id: string; terminals: { point: [number, number] }[] }[]).find((g) => g.id === id);
      if (opening && group) setFocus((prev) => ({ points: group.terminals.map((t) => t.point), nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [openTerminalGroup, terminalListing],
  );

  const openView = useCallback(
    (next: ViewId | null) => {
      setCollapsed(false);
      setView(next);
      if (next) setFocus((prev) => ({ points: viewPoints(next, data), nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [setView, data],
  );

  // The app menu: open (optionally at a section) or closed. Focus returns to its button on close.
  const [menu, setMenu] = useState<{ section: MenuSection | null } | null>(null);
  // Help, the menu button and the rail's settings all open it; focus returns to whichever did.
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const openMenu = useCallback((section: MenuSection | null) => {
    menuOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenu({ section });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  // After the menu closes and the page is no longer inert, focus goes back to its opener.
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (!menu && menuWasOpen.current) menuOpenerRef.current?.focus();
    menuWasOpen.current = menu !== null;
  }, [menu]);
  const now = useNow();
  const freshness = sortFreshness(data.meta.map((m) => datasetFreshness(m, now)));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The search dialog handles its own keys.
      if (searchOpen) return;
      // ⌘K or Ctrl+K opens search from anywhere, even a text field.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !menu) {
        event.preventDefault();
        setSearchScope('all');
        return;
      }
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
        setSearchScope('all');
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
  }, [back, toggleCollapsed, menu, closeMenu, layersOpen, searchOpen]);

  // Closing search puts focus back on the header's search button, once the page is no longer inert.
  const closeSearch = useCallback(() => {
    setSearchScope(null);
    requestAnimationFrame(() => searchButtonRef.current?.focus());
  }, []);

  // On phones, opening an item, a surface or a filter lifts the sheet from peek so its page shows.
  const pageKey = `${view}|${filter}|${selection?.kind}/${selection?.id}`;
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastPage.current;
    lastPage.current = pageKey;
    if (previous === pageKey) return;
    // A shared link to an item opens with the item showing; Home opens at peek.
    if (previous === null && !selection && !filter && !view) return;
    if (phone) setSheetDetent((d) => (d === 'peek' ? 'half' : d));
  }, [pageKey, phone]);

  const setLayerVisible = useCallback((id: LayerId, visible: boolean) => {
    setVisibility((v) => ({ ...v, [id]: visible }));
  }, []);

  return (
    <div ref={appRef} className="app" data-panel-collapsed={!phone && collapsed} data-sheet={phone ? sheetDetent : undefined}>
      {/* Everything but the menu; inert while the menu is open, so focus and clicks stay in it. */}
      <div className="app__content" inert={menu !== null || searchOpen}>
        <header className="app-header">
          <div className="app-header__brand">
            <span className="brand-mark" aria-hidden="true">
              <LightbulbIcon size={14} weight="fill" />
            </span>
            <h1 className="app-header__title">Energy terminal</h1>
          </div>
          {/* One search bar whether the panel is open or minimized, so it never moves. */}
          <SearchBar onOpen={() => setSearchScope('all')} buttonRef={searchButtonRef} />
          <div className="app-header__actions">
            <button type="button" className="button" onClick={() => openMenu('about')}>
              <QuestionIcon size={24} aria-hidden="true" />
              Help
            </button>
            <button
              type="button"
              className="icon-button icon-button--lg"
              onClick={() => openMenu(null)}
              aria-label="Menu"
              aria-haspopup="dialog"
              title="Menu"
            >
              <ListIcon size={24} />
            </button>
          </div>
        </header>
        <nav className="rail" aria-label="Views">
          <button
            type="button"
            className="rail__item"
            aria-current={!view ? 'page' : undefined}
            onClick={() => openView(null)}
            aria-label="Home"
          >
            <HouseIcon size={24} weight={!view ? 'fill' : 'regular'} />
            <span className="rail__tooltip" aria-hidden="true">
              Home
            </span>
          </button>
          {VIEW_IDS.map((id) => {
            const Icon = VIEW_ICONS[id];
            return (
              <button
                key={id}
                type="button"
                className="rail__item"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => openView(id)}
                aria-label={VIEW_LABELS[id]}
              >
                <Icon size={24} weight={view === id ? 'fill' : 'regular'} />
                <span className="rail__tooltip" aria-hidden="true">
                  {VIEW_LABELS[id]}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="rail__item rail__item--end"
            onClick={() => openMenu(null)}
            aria-label="Settings"
            aria-haspopup="dialog"
          >
            <GearIcon size={24} />
            <span className="rail__tooltip" aria-hidden="true">
              Settings
            </span>
          </button>
        </nav>
        <Panel
          view={view}
          pipelines={{
            groups: pipelineGroupList,
            grouping: pipelineGrouping,
            onGrouping: changePipelineGrouping,
            openGroup: openPipelineGroup,
            onToggleGroup: togglePipelineGroup,
          }}
          origins={{ fuel: originsFuel, onFuel: setOriginsFuel, onFind: () => setSearchScope('us-places') }}
          terminals={{
            listing: terminalListing,
            onKind: changeTerminalKind,
            grouping: terminalGrouping[terminalKind],
            onGrouping: changeTerminalGrouping,
            openGroup: openTerminalGroup,
            onToggleGroup: toggleTerminalGroup,
          }}
          surfaceLabel={surfaceLabel}
          backLabel={backLabel}
          onBack={back}
          onClose={() => setView(view)}
          collapsed={!phone && collapsed}
          onToggleCollapsed={toggleCollapsed}
          sheet={phone ? sheet : null}
          selection={selection}
          onSelect={selectAndFocus}
          fuel={fuel}
          onFuel={setFuel}
          data={data}
          loaded={loaded}
          failed={failed}
          visit={visit}
          filter={filter}
          matches={matches}
          freshness={freshness}
          now={now}
          onOpenMenu={openMenu}
          onOpenView={openView}
        />
        <MapView
          theme={theme}
          initialCamera={initialCameraOnce}
          onCameraChange={setCamera}
          data={data}
          visibility={visibility}
          selection={selection}
          fuel={fuel}
          highlight={highlight}
          regionsOnly={regionsOnly}
          onSelect={selectAndFocus}
          focus={focus}
          insets={sheet.insets}
        >
          <FilterChips
            active={filter}
            ids={surfaceFilters}
            counts={Object.fromEntries(FILTER_IDS.map((id) => [id, matchCount(surfaceMatches[id])])) as Record<FilterId, number>}
            onChange={changeFilter}
          />
          {!phone && collapsed && (
            <button
              type="button"
              className="panel__tab panel__tab--expand"
              onClick={toggleCollapsed}
              aria-label="Expand panel"
              title="Expand panel  ["
            >
              <CaretRightIcon size={16} />
            </button>
          )}
          {/* The layers have nothing to switch while only the regions show. */}
          {!regionsOnly && <LayerControl
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
              terminals: data.oilTerminals.length,
              chokepoints: data.chokepoints.length,
            }}
          />}
        </MapView>
      </div>
      {searchOpen && (
        <SearchDialog
          data={data}
          initialScope={searchScope}
          onSelect={(next) => {
            closeSearch();
            selectAndFocus(next);
          }}
          onView={(next) => {
            closeSearch();
            openView(next);
          }}
          onClose={closeSearch}
        />
      )}
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
