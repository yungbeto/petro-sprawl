import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type FocusRequest } from '../map/MapView';
import { LayerControl } from '../map/LayerControl';
import type { LayerId, LayerVisibility } from '../map/layers';
import { CaretRightIcon, DotsThreeOutlineIcon, HouseIcon, ListIcon, QuestionIcon } from '@phosphor-icons/react';
import { VIEW_ICONS } from './viewIcons';
import { pipelineGroups, type PipelineGrouping } from '../lib/pipelineGroups';
import { lngGroups, oilGroups, type TerminalGrouping, type TerminalKind } from '../lib/terminalGroups';
import { refineryGroups, type RefineryGrouping } from '../lib/refineries';
import { fieldGroups, fieldScale, type FieldGrouping } from '../lib/fields';
import type { TerminalListing } from '../panel/TerminalsView';
import type { BasinsMode } from '../panel/BasinsView';
import type { Pipeline } from '../types';
import { Panel } from '../panel/Panel';
import { SearchBar, SearchDialog } from '../panel/Search';
import { FilterChips } from '../map/FilterChips';
import { FILTER_IDS, FILTER_LABELS, filterMatches, matchCount, type FilterId, type FilterMatches } from '../lib/filters';
import { useTheme } from './useTheme';
import { GlobeMark } from './GlobeMark';
import { MapLoading } from '../map/MapLoading';
import { useNow } from './useNow';
import { AppMenu, type MenuSection } from './AppMenu';
import { datasetFreshness, sortFreshness } from '../lib/freshness';
import { surfaceCamera, useUrlState } from './useUrlState';
import { DEFAULT_REGION_FUEL, type RegionFuel } from '../lib/config';
import type { SearchScope } from '../lib/search';
import { useDatasets } from './useDatasets';
import { pipelinesTouchingBasin, resolveSelection } from '../lib/data';
import { ENABLED_VIEWS, SURFACE_FILTERS, basinPipelineFocus, closeFrame, VIEW_LABELS, phoneTabs, scopeMatches, viewHighlight, viewPoints, visibleLayers, type ViewId } from '../lib/views';
import { useVisitChanges } from './useVisitChanges';
import { useIsPhone, useSheet } from './useSheet';
import { ShowOnMapContext, type ShowOnMap } from './showOnMap';
import { liftDetent } from '../lib/sheet';
import type { Selection } from './urlState';
import { IconButton } from '../ui/Button';

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
  const { from, view, setView, selection, select, fuel, setFuel, filter, setFilter, back, restore, setCamera, initialCamera } = useUrlState();
  const { preference, setPreference, theme } = useTheme();
  const { data, loaded, failed } = useDatasets();
  const visit = useVisitChanges(data, loaded, failed);
  // Every visit opens on the summary; minimizing lasts until something is selected.
  const [collapsed, setCollapsed] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const closeLayers = useCallback(() => setLayersOpen(false), []);
  // Home's layer list. Storage fills whole countries, so it starts off; a selected country turns it on
  // (`visibleLayers`). A surface shows its own layers whatever this says.
  const [visibility, setVisibility] = useState<LayerVisibility>(() => ({
    storage: false,
    basins: true,
    shale: true,
    // Some 6,500 fields would bury Home's disruptions; Basins shows them, and the layer list turns them on.
    fields: false,
    pipelines: true,
    lng: true,
    terminals: true,
    refineries: true,
    chokepoints: true,
  }));
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  // Phones: the panel is a bottom sheet over a full-screen map, and the rail a tab bar.
  const phone = useIsPhone();
  const sheet = useSheet(phone, appRef);
  const { detent: sheetDetent, setDetent: setSheetDetent } = sheet;
  // Phones with more sections than tab slots: the bar's sections, those under More, and whether its list is open.
  const tabs = useMemo(() => (phone ? phoneTabs() : { bar: [...ENABLED_VIEWS], more: [] }), [phone]);
  const [moreOpen, setMoreOpen] = useState(false);
  // The open search's starting scope, or null while it's closed.
  const [searchScope, setSearchScope] = useState<SearchScope | null>(null);
  const searchOpen = searchScope !== null;
  const [initialCameraOnce] = useState(initialCamera);

  const selectAndFocus = useCallback(
    (next: Selection, nextFuel?: RegionFuel) => {
      select(next, nextFuel);
      setCollapsed(false);
      setFocus((prev) => ({ selection: next, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [select],
  );

  // Stepping back (or forward) returns the camera to the one that step had; with none, the surface's frame.
  useEffect(() => {
    if (!restore) return;
    setFocus((prev) => ({ ...closeFrame(restore.camera, view, data), nonce: (prev?.nonce ?? 0) + 1 }));
    // Only a new step moves the camera; `view` is already the step's.
  }, [restore]);

  // Close leaves the whole chain of open items: the camera returns to before the first was opened.
  const closeToSurface = useCallback(() => {
    const camera = selection ? surfaceCamera() : null;
    const closing = Boolean(selection);
    setView(view);
    if (closing) setFocus((prev) => ({ ...closeFrame(camera, view, data), nonce: (prev?.nonce ?? 0) + 1 }));
  }, [selection, setView, view, data]);

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
  // The basins surface shows USGS provinces or EIA's shale plays (M12).
  const [basinsMode, setBasinsMode] = useState<BasinsMode>('provinces');
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

  // The refineries surface's grouping and open group.
  const [refineryGrouping, setRefineryGrouping] = useState<RefineryGrouping>('region');
  const [openRefineryGroup, setOpenRefineryGroup] = useState<string | null>(null);
  const refineryGroupList = useMemo(
    () => (view === 'refineries' ? refineryGroups(data.refineries, refineryGrouping) : []),
    [view, data, refineryGrouping],
  );
  const openRefineries = useMemo(
    () => refineryGroupList.find((g) => g.id === openRefineryGroup)?.refineries ?? null,
    [refineryGroupList, openRefineryGroup],
  );

  // The fields' grouping and open group (M13), on the basins surface's Fields switch.
  const [fieldGrouping, setFieldGrouping] = useState<FieldGrouping>('country');
  const [openFieldGroup, setOpenFieldGroup] = useState<string | null>(null);
  const fieldsListed = view === 'basins' && basinsMode === 'fields';
  const fieldGroupList = useMemo(
    () => (fieldsListed ? fieldGroups(data.fields, fieldGrouping, fieldScale(data.fields)) : []),
    [fieldsListed, data, fieldGrouping],
  );
  const openFields = useMemo(() => fieldGroupList.find((g) => g.id === openFieldGroup)?.fields ?? null, [fieldGroupList, openFieldGroup]);

  const groupMatches = useMemo((): FilterMatches | null => {
    const none = () => new Set<string>();
    if (openGroup) return { pipelines: new Set(openGroup.pipelines.map((p) => p.id)), chokepoints: none(), lng: none(), terminals: none(), refineries: none() };
    if (view === 'refineries' && openRefineries) {
      return { pipelines: none(), chokepoints: none(), lng: none(), terminals: none(), refineries: new Set(openRefineries.map((r) => r.id)) };
    }
    if (view !== 'terminals') return null;
    // The kind switch keeps its own kind bright; an open group narrows that to the group.
    const ids = new Set(
      openTerminals ? openTerminals.map((t) => t.id) : (terminalKind === 'lng' ? data.lngTerminals : data.oilTerminals).map((t) => t.id),
    );
    return { pipelines: none(), chokepoints: none(), lng: terminalKind === 'lng' ? ids : none(), terminals: terminalKind === 'oil' ? ids : none(), refineries: none() };
  }, [openGroup, view, openTerminals, openRefineries, terminalKind, data]);

  // Fuel origins shows only the regions: on its own page, and on a region opened from anywhere. Opening
  // anything else from the surface brings the other layers back.
  // A US fuel region shows only its outlines and arcs; the oil origins surface itself shows countries (M10).
  const regionsOnly = selection?.kind === 'region';

  // Each surface draws only its own layers, and the open item's (decided 2026-11-01).
  // On the basins surface fields show only on their own switch, and shale plays off it, unless one is open.
  const mapLayers = useMemo(() => {
    const layers = visibleLayers(view, selection, visibility);
    if (view !== 'basins') return layers;
    return {
      ...layers,
      fields: layers.fields && (basinsMode === 'fields' || selection?.kind === 'field'),
      shale: layers.shale && (basinsMode !== 'fields' || selection?.kind === 'shale'),
    };
  }, [view, selection, visibility, basinsMode]);

  // A filter narrows the map; otherwise an open group, otherwise the open view, sets what stays bright.
  const viewMatches = useMemo(() => (view ? viewHighlight(view, data) : null), [view, data]);
  // An open basin brings the pipelines that touch it (decided 2026-11-01). On the basins surface the
  // basin stays in focus while you open its pipelines, until you go back to the list or leave.
  // A shale play (M12) is an outline too, and works the same way.
  const [basinTrail, setBasinTrail] = useState<Selection | null>(null);
  const outlineOpen = selection?.kind === 'basin' || selection?.kind === 'shale';
  const nextBasinTrail = view === 'basins' && selection ? (outlineOpen ? selection : basinTrail) : null;
  if (nextBasinTrail?.kind !== basinTrail?.kind || nextBasinTrail?.id !== basinTrail?.id) setBasinTrail(nextBasinTrail);
  const focusedOutline = outlineOpen ? selection : nextBasinTrail;
  const basin =
    focusedOutline?.kind === 'basin'
      ? data.basins.find((b) => b.id === focusedOutline.id)
      : focusedOutline?.kind === 'shale'
        ? data.shalePlays.find((p) => p.id === focusedOutline.id)
        : undefined;
  const basinPipelines = useMemo(
    () => (basin ? new Set(pipelinesTouchingBasin(basin, data.pipelines).map((p) => p.id)) : null),
    [basin, data.pipelines],
  );
  const basinFocus = useMemo(
    () =>
      basinPipelineFocus(
        view,
        basinPipelines,
        selection?.kind === 'pipeline' ? selection.id : null,
        matches ?? groupMatches ?? viewMatches,
        Boolean(matches),
        data,
      ),
    [view, basinPipelines, selection, matches, groupMatches, viewMatches, data],
  );
  const highlight = basinFocus ? basinFocus.highlight : (matches ?? groupMatches ?? viewMatches);
  // Fields stay bright unless a group is open (only its fields) or a quick filter is on (no chip matches a field).
  const fieldHighlight = useMemo(
    () => (fieldsListed && openFields ? new Set(openFields.map((f) => f.id)) : matches ? new Set<string>() : null),
    [fieldsListed, openFields, matches],
  );

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

  const changeRefineryGrouping = useCallback((next: RefineryGrouping) => {
    setRefineryGrouping(next);
    setOpenRefineryGroup(null);
  }, []);
  // Opening a group frames its refineries.
  const toggleRefineryGroup = useCallback(
    (id: string) => {
      const opening = openRefineryGroup !== id;
      setOpenRefineryGroup(opening ? id : null);
      const group = refineryGroupList.find((g) => g.id === id);
      if (opening && group) setFocus((prev) => ({ points: group.refineries.map((r) => r.point), nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [openRefineryGroup, refineryGroupList],
  );

  const changeFieldGrouping = useCallback((next: FieldGrouping) => {
    setFieldGrouping(next);
    setOpenFieldGroup(null);
  }, []);
  // Opening a group frames its fields.
  const toggleFieldGroup = useCallback(
    (id: string) => {
      const opening = openFieldGroup !== id;
      setOpenFieldGroup(opening ? id : null);
      const group = fieldGroupList.find((g) => g.id === id);
      if (opening && group) setFocus((prev) => ({ points: group.fields.map((f) => f.point), nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [openFieldGroup, fieldGroupList],
  );

  // Switching to shale plays frames them: they're all in the Lower 48.
  const changeBasinsMode = useCallback(
    (next: BasinsMode) => {
      setBasinsMode(next);
      const points = next === 'shale' ? data.shalePlays.map((p) => p.labelPoint) : viewPoints('basins', data);
      if (points.length) setFocus((prev) => ({ points, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [data],
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
      setMoreOpen(false);
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
      } else if ((event.key === 'l' || event.key === 'L') && !view && !regionsOnly) {
        // The layer list is Home's; a surface draws its own layers.
        setLayersOpen((open) => !open);
      } else if (event.key === 'Escape') {
        // An open layer list closes before the panel steps back.
        if (layersOpen) setLayersOpen(false);
        else back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, toggleCollapsed, menu, closeMenu, layersOpen, searchOpen, view, regionsOnly]);

  // Closing search puts focus back on the header's search button, once the page is no longer inert.
  const closeSearch = useCallback(() => {
    setSearchScope(null);
    requestAnimationFrame(() => searchButtonRef.current?.focus());
  }, []);

  // On phones, opening an item, a surface or a filter lifts a hidden or peeking sheet so its page shows.
  const pageKey = `${view}|${filter}|${selection?.kind}/${selection?.id}`;
  const pageKeyRef = useRef(pageKey);
  pageKeyRef.current = pageKey;
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastPage.current;
    lastPage.current = pageKey;
    if (previous === pageKey) return;
    // A shared link to an item opens with the item showing; Home opens at peek.
    if (previous === null && !selection && !filter && !view) return;
    if (phone) setSheetDetent(liftDetent);
  }, [pageKey, phone]);

  // The More list closes when anything else opens, and isn't a thing off phones.
  useEffect(() => setMoreOpen(false), [selection?.kind, selection?.id, filter, phone]);
  const openMore = useCallback(() => {
    setMoreOpen(true);
    setSheetDetent(liftDetent);
  }, [setSheetDetent]);

  // A headline thumbnail's "show on map": the map moves to the square it draws, and nothing opens. On phones a
  // sheet at full comes down to half so the map can be seen. Below full the page goes back to its top
  // (useSheet), so where the list was is kept, and raising the sheet to full on the same page returns to it.
  const listScroll = useRef<{ page: string; top: number } | null>(null);
  const showOnMap = useCallback<ShowOnMap>(
    (corners) => {
      setFocus((prev) => ({ points: corners, nonce: (prev?.nonce ?? 0) + 1 }));
      if (!phone) return;
      const body = appRef.current?.querySelector('.panel__body');
      if (sheetDetent === 'full' && body) listScroll.current = { page: pageKeyRef.current, top: body.scrollTop };
      setSheetDetent((d) => (d === 'full' ? 'half' : d));
    },
    [phone, sheetDetent, setSheetDetent],
  );
  useEffect(() => {
    const saved = listScroll.current;
    if (!saved || sheetDetent !== 'full') return;
    listScroll.current = null;
    if (saved.page !== pageKeyRef.current) return;
    requestAnimationFrame(() => appRef.current?.querySelector('.panel__body')?.scrollTo({ top: saved.top }));
  }, [sheetDetent]);

  const setLayerVisible = useCallback((id: LayerId, visible: boolean) => {
    setVisibility((v) => ({ ...v, [id]: visible }));
  }, []);

  return (
    <ShowOnMapContext.Provider value={showOnMap}>
      <div ref={appRef} className="app" data-panel-collapsed={!phone && collapsed} data-sheet={phone ? sheetDetent : undefined}>
        {/* Everything but the menu; inert while the menu is open, so focus and clicks stay in it. */}
        <div className="app__content" inert={menu !== null || searchOpen}>
          <header className="app-header">
            <div className="app-header__brand">
              <GlobeMark theme={theme} />
              <h1 className="app-header__title">Petro Sprawl</h1>
            </div>
            {/* One search bar whether the panel is open or minimized, so it never moves. */}
            <SearchBar onOpen={() => setSearchScope('all')} buttonRef={searchButtonRef} />
            <div className="app-header__actions">
              <IconButton size="lg" onClick={() => openMenu(null)} label="Menu" aria-haspopup="dialog" title="Menu">
                <ListIcon size={24} />
              </IconButton>
            </div>
          </header>
          <nav className="rail" aria-label="Views">
            <button
              type="button"
              className="rail__item"
              aria-current={!view && !moreOpen ? 'page' : undefined}
              onClick={() => openView(null)}
              aria-label="Home"
            >
              <HouseIcon size={24} weight={!view && !moreOpen ? 'fill' : 'regular'} />
              <span className="rail__tooltip" aria-hidden="true">
                Home
              </span>
            </button>
            {tabs.bar.map((id) => {
              const Icon = VIEW_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="rail__item"
                  aria-current={view === id && !moreOpen ? 'page' : undefined}
                  onClick={() => openView(id)}
                  aria-label={VIEW_LABELS[id]}
                >
                  <Icon size={24} weight={view === id && !moreOpen ? 'fill' : 'regular'} />
                  <span className="rail__tooltip" aria-hidden="true">
                    {VIEW_LABELS[id]}
                  </span>
                </button>
              );
            })}
            {tabs.more.length > 0 && <MoreTab views={tabs.more} view={view} open={moreOpen} onOpen={openMore} />}
            <button
              type="button"
              className="rail__item rail__item--end"
              onClick={() => openMenu('about')}
              aria-label="Help"
              aria-haspopup="dialog"
            >
              <QuestionIcon size={24} />
              <span className="rail__tooltip" aria-hidden="true">
                Help
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
            basins={{
              mode: basinsMode,
              onMode: changeBasinsMode,
              fields: {
                groups: fieldGroupList,
                grouping: fieldGrouping,
                onGrouping: changeFieldGrouping,
                openGroup: openFieldGroup,
                onToggleGroup: toggleFieldGroup,
              },
            }}
            refineries={{
              groups: refineryGroupList,
              grouping: refineryGrouping,
              onGrouping: changeRefineryGrouping,
              openGroup: openRefineryGroup,
              onToggleGroup: toggleRefineryGroup,
            }}
            surfaceLabel={surfaceLabel}
            backLabel={backLabel}
            onBack={back}
            onClose={closeToSurface}
            collapsed={!phone && collapsed}
            onToggleCollapsed={toggleCollapsed}
            sheet={phone ? sheet : null}
            more={moreOpen ? { views: tabs.more, onOpen: openView } : null}
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
            visibility={mapLayers}
            selection={selection}
            fuel={fuel}
            highlight={highlight}
            fieldHighlight={fieldHighlight}
            onlyPipelines={basinFocus?.only ?? null}
            regionsOnly={regionsOnly}
            basinsFocus={view === 'basins'}
            countryMode={view === 'origins' ? 'imports' : 'storage'}
            onSelect={selectAndFocus}
            focus={focus}
            insets={sheet.insets}
          >
            <MapLoading loading={!loaded} theme={theme} />
            {/* Their counts mean nothing until the data is in. */}
            {loaded && (
              <FilterChips
                active={filter}
                ids={surfaceFilters}
                counts={Object.fromEntries(FILTER_IDS.map((id) => [id, matchCount(surfaceMatches[id])])) as Record<FilterId, number>}
                onChange={changeFilter}
              />
            )}
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
            {/* Home's alone: a surface shows its own layers, and the regions view only its outlines. */}
            {!view && !regionsOnly && <LayerControl
              open={layersOpen}
              onToggleOpen={() => setLayersOpen((open) => !open)}
              onClose={closeLayers}
              visibility={visibility}
              onChange={setLayerVisible}
              counts={{
                storage: data.series.filter((s) => s.metric === 'storage_fill_pct').length,
                basins: data.basins.length,
                shale: data.shalePlays.length,
                fields: data.fields.length,
                pipelines: data.pipelines.length,
                lng: data.lngTerminals.length,
                terminals: data.oilTerminals.length,
                refineries: data.refineries.length,
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
            theme={theme}
            themePreference={preference}
            onThemePreferenceChange={setPreference}
          />
        )}
      </div>
    </ShowOnMapContext.Provider>
  );
}

/**
 * The phone bar's last slot when the sections don't all fit (SPEC M10). It opens the list of the rest;
 * while one of those is the open section, it shows that section's icon and name instead, so where you
 * are stays in the bar.
 */
function MoreTab({ views, view, open, onOpen }: { views: ViewId[]; view: ViewId | null; open: boolean; onOpen: () => void }) {
  const inside = view !== null && views.includes(view) ? view : null;
  const Icon = inside ? VIEW_ICONS[inside] : DotsThreeOutlineIcon;
  const label = inside ? VIEW_LABELS[inside] : 'More';
  return (
    <button
      type="button"
      className="rail__item"
      aria-current={open || inside ? 'page' : undefined}
      aria-label={inside ? `More, ${label} open` : 'More'}
      onClick={onOpen}
    >
      <Icon size={24} weight={open || inside ? 'fill' : 'regular'} />
      <span className="rail__tooltip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}
