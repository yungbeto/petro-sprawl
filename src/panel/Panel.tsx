import { ArrowLeftIcon, XIcon } from '@phosphor-icons/react';
import { useLayoutEffect, useRef } from 'react';
import type { Selection, SelectionKind } from '../app/urlState';
import type { RegionFuel } from '../lib/config';
import { resolveSelection, type Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { formatAge, formatUtcClock, overallFreshness, type Freshness } from '../lib/freshness';
import type { MenuSection } from '../app/AppMenu';
import type { VisitChanges } from '../app/useVisitChanges';
import type { Sheet } from '../app/useSheet';
import { Summary } from './Summary';
import { FilterList } from './FilterList';
import type { FilterId, FilterMatches } from '../lib/filters';
import { VIEW_LABELS, type ViewId } from '../lib/views';
import { BasinsView } from './BasinsView';
import { ChokepointsView } from './ChokepointsView';
import { PipelinesView, type PipelinesViewProps } from './PipelinesView';
import { TerminalsView, type TerminalsViewProps } from './TerminalsView';
import { StorageView } from './StorageView';
import { MoreView } from './MoreView';
import { DetailSkeleton, HomeSkeleton, ListSkeleton } from './Skeleton';
import { OriginsView, type OriginsViewProps } from './OriginsView';
import { BasinDetail, ChokepointDetail, detailKind, LngDetail, OilTerminalDetail, PipelineDetail, RegionDetail, CountryDetail } from './details';

interface PanelProps {
  /** The rail view; its list shows when nothing is selected or filtered. Null is home. */
  view: ViewId | null;
  /** The pipelines surface's groups and grouping, held by the app. */
  pipelines: Pick<PipelinesViewProps, 'groups' | 'grouping' | 'onGrouping' | 'openGroup' | 'onToggleGroup'>;
  /** The terminals surface's kind, groups and grouping, held by the app. */
  terminals: Omit<TerminalsViewProps, 'data' | 'onSelect'>;
  /** The fuel origins surface's fuel, held by the app, and its way into search. */
  origins: Pick<OriginsViewProps, 'fuel' | 'onFuel' | 'onFind'>;
  /** The rail surface's name, for the close button: "Home" or the view's. */
  surfaceLabel: string;
  /** What Back returns to, when this was opened from another item or list in the same surface. */
  backLabel: string | null;
  onBack: () => void;
  /** Returns to the surface's own page. */
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selection: Selection | null;
  onSelect: (selection: Selection, fuel?: RegionFuel) => void;
  /** The open region's fuel, and switching it in place. */
  fuel: RegionFuel;
  onFuel: (fuel: RegionFuel) => void;
  data: Datasets;
  loaded: boolean;
  failed: string[];
  visit: VisitChanges | null;
  filter: FilterId | null;
  matches: FilterMatches | null;
  freshness: Freshness[];
  now: Date;
  onOpenMenu: (section: MenuSection) => void;
  onOpenView: (view: ViewId) => void;
  /** On phones the panel is a bottom sheet: a handle to drag or tap, and the top bar drags it too. */
  sheet?: Sheet | null;
  /** Phones: the More tab's list of the sections that don't fit in the bar, while it's open. */
  more?: { views: ViewId[]; onOpen: (view: ViewId) => void } | null;
}

const KIND_LABELS: Record<SelectionKind, string> = {
  pipeline: 'Pipeline',
  chokepoint: 'Chokepoint',
  basin: 'Basin',
  country: 'Country',
  lng: 'LNG terminal',
  terminal: 'Oil terminal',
  region: 'US fuel region',
};


const SHEET_HANDLE_LABELS: Record<Sheet['detent'], string> = {
  hidden: 'Show panel',
  peek: 'Expand panel',
  half: 'Expand panel to full height',
  full: 'Collapse panel',
};

/** The top bar's title: what kind of thing is open, or that a map filter's matches are listed. */
function navTitle(selection: Selection | null, filter: FilterId | null, data: Datasets): string {
  if (selection) {
    const resolved = resolveSelection(selection, data);
    return resolved ? detailKind(resolved) : KIND_LABELS[selection.kind];
  }
  return filter ? 'Map filter' : '';
}

export function Panel(props: PanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  const { now, freshness } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  // Each new page starts at its top, not where the last one was scrolled to.
  const pageKey = `${props.view}|${props.filter}|${props.selection?.kind}/${props.selection?.id}`;
  useLayoutEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [pageKey]);

  if (collapsed) return null;
  const { sheet } = props;

  return (
    <aside className="panel" aria-label="Panel">
      {sheet ? (
        <button
          type="button"
          className="sheet-handle"
          onPointerDown={sheet.onDragStart}
          onClick={sheet.cycle}
          aria-label={SHEET_HANDLE_LABELS[sheet.detent]}
        >
          <span className="sheet-handle__bar" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="panel__tab"
          onClick={onToggleCollapsed}
          aria-label="Collapse panel"
          title="Collapse panel  ["
        >
          <ChevronIcon direction="left" />
        </button>
      )}
      {!props.more && (props.selection || props.filter) && (
        <div className="panel__nav" onPointerDown={sheet?.onDragStart}>
          {props.backLabel && (
            <button
              type="button"
              className="icon-button panel__back"
              onClick={props.onBack}
              aria-label={`Back to ${props.backLabel}`}
              title={`Back to ${props.backLabel}  Esc`}
            >
              <ArrowLeftIcon size={18} />
            </button>
          )}
          <p className="panel__title">{navTitle(props.selection, props.filter, props.data)}</p>
          <button
            type="button"
            className="icon-button panel__close"
            onClick={props.onClose}
            aria-label={`Close, back to ${props.surfaceLabel}`}
            title={`Close, back to ${props.surfaceLabel}`}
          >
            <XIcon size={18} />
          </button>
        </div>
      )}
      <div ref={bodyRef} className="panel__body" onPointerDown={sheet?.onContentPointerDown}>
        {props.more ? (
          <MoreView views={props.more.views} current={props.view} onOpen={props.more.onOpen} />
        ) : !props.loaded ? (
          props.selection ? (
            <DetailSkeleton kind={KIND_LABELS[props.selection.kind]} />
          ) : props.view ? (
            <ListSkeleton label={VIEW_LABELS[props.view]} />
          ) : (
            <HomeSkeleton />
          )
        ) : props.selection ? (
          <Detail
            view={props.view}
            selection={props.selection}
            data={props.data}
            onSelect={props.onSelect}
            fuel={props.fuel}
            onFuel={props.onFuel}
            now={now}
          />
        ) : props.filter && props.matches ? (
          <FilterList
            filter={props.filter}
            matches={props.matches}
            data={props.data}
            onSelect={props.onSelect}
            within={props.view ? VIEW_LABELS[props.view] : null}
          />
        ) : props.view === 'chokepoints' ? (
          <ChokepointsView data={props.data} onSelect={props.onSelect} />
        ) : props.view === 'pipelines' ? (
          <PipelinesView data={props.data} {...props.pipelines} onSelect={props.onSelect} />
        ) : props.view === 'terminals' ? (
          <TerminalsView data={props.data} {...props.terminals} onSelect={props.onSelect} />
        ) : props.view === 'basins' ? (
          <BasinsView data={props.data} onSelect={props.onSelect} />
        ) : props.view === 'storage' ? (
          <StorageView data={props.data} onSelect={props.onSelect} />
        ) : props.view === 'origins' ? (
          <OriginsView data={props.data} {...props.origins} onSelect={props.onSelect} />
        ) : (
          <Summary
            data={props.data}
            loaded={props.loaded}
            failed={props.failed}
            visit={props.visit}
            now={now}
            onSelect={props.onSelect}
            onOpenView={props.onOpenView}
          />
        )}
      </div>

      <footer className="panel__footer">
        {props.loaded ? (
          <FooterFreshness freshness={freshness} now={now} onOpen={() => props.onOpenMenu('data')} />
        ) : (
          <p className="muted">Loading data</p>
        )}
      </footer>
    </aside>
  );
}

/** Data age stays on screen (SPEC 2); the full table is in the menu. */
function FooterFreshness({ freshness, now, onOpen }: { freshness: Freshness[]; now: Date; onOpen: () => void }) {
  const overall = overallFreshness(freshness);
  if (!overall) return <p className="muted">No datasets loaded yet</p>;
  const warn = freshness.some((f) => f.stale || f.failedAt);
  const text = overall.scheduled
    ? `Updated ${formatAge(overall.fetchedAt, now)} · ${formatUtcClock(overall.fetchedAt)}`
    : `Imported ${formatDate(overall.fetchedAt)}`;
  return (
    <button
      type="button"
      className={`footer-freshness ${warn ? 'freshness--warn' : 'muted'}`}
      onClick={onOpen}
      title={warn ? 'Some data is stale or failed to update. Show data freshness' : 'Show data freshness'}
    >
      <span className="mono">{text}</span>
      {warn && ' · some data stale'}
    </button>
  );
}

function Detail({
  selection,
  data,
  onSelect,
  fuel,
  onFuel,
  now,
  view,
}: {
  view: ViewId | null;
  selection: Selection;
  data: Datasets;
  now: Date;
  onSelect: (selection: Selection, fuel?: RegionFuel) => void;
  fuel: RegionFuel;
  onFuel: (fuel: RegionFuel) => void;
}) {
  const resolved = resolveSelection(selection, data);
  return (
    <>
      {resolved?.kind === 'chokepoint' && <ChokepointDetail item={resolved.item} data={data} onSelect={onSelect} />}
      {resolved?.kind === 'basin' && <BasinDetail item={resolved.item} data={data} onSelect={onSelect} />}
      {resolved?.kind === 'pipeline' && <PipelineDetail item={resolved.item} data={data} now={now} onSelect={onSelect} />}
      {resolved?.kind === 'country' && <CountryDetail item={resolved.item} data={data} view={view} onSelect={onSelect} />}
      {resolved?.kind === 'lng' && <LngDetail item={resolved.item} data={data} now={now} />}
      {resolved?.kind === 'terminal' && <OilTerminalDetail item={resolved.item} data={data} now={now} onSelect={onSelect} />}
      {resolved?.kind === 'region' && <RegionDetail item={resolved.item} data={data} onSelect={onSelect} fuel={fuel} onFuel={onFuel} />}
      {!resolved && (
        <section className="section">
          <p className="muted">{KIND_LABELS[selection.kind]}</p>
          <h2 className="detail__title mono">{selection.id}</h2>
          <p className="muted">Not in the loaded data.</p>
        </section>
      )}
    </>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
