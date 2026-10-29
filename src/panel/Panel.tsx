import type { Selection, SelectionKind } from '../app/urlState';
import type { RegionFuel } from '../lib/config';
import { resolveSelection, type Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { formatAge, formatUtcClock, overallFreshness, type Freshness } from '../lib/freshness';
import type { MenuSection } from '../app/AppMenu';
import type { VisitChanges } from '../app/useVisitChanges';
import { Summary } from './Summary';
import { FilterList } from './FilterList';
import type { FilterId, FilterMatches } from '../lib/filters';
import { BasinDetail, ChokepointDetail, LngDetail, OilTerminalDetail, PipelineDetail, RegionDetail, StorageDetail } from './details';

interface PanelProps {
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
  onFilter: (filter: FilterId) => void;
  onShowStorage: () => void;
}

const KIND_LABELS: Record<SelectionKind, string> = {
  pipeline: 'Pipeline',
  chokepoint: 'Chokepoint',
  basin: 'Basin',
  storage: 'Gas storage',
  lng: 'LNG terminal',
  terminal: 'Oil terminal',
  region: 'US fuel region',
};


export function Panel(props: PanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  const { now, freshness } = props;

  if (collapsed) return null;

  return (
    <aside className="panel" aria-label="Panel">
      <button
        type="button"
        className="panel__tab"
        onClick={onToggleCollapsed}
        aria-label="Collapse panel"
        title="Collapse panel  ["
      >
        <ChevronIcon direction="left" />
      </button>
      {/* The floating search bar sits over the top of the panel; the name is for screen readers. */}
      <h1 className="visually-hidden">Energy terminal</h1>

      <div className="panel__body">
        {props.selection ? (
          <Detail
            selection={props.selection}
            data={props.data}
            loaded={props.loaded}
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
          />
        ) : (
          <Summary
            data={props.data}
            loaded={props.loaded}
            failed={props.failed}
            visit={props.visit}
            now={now}
            onSelect={props.onSelect}
            onFilter={props.onFilter}
            onShowStorage={props.onShowStorage}
          />
        )}
      </div>

      <footer className="panel__footer">
        <FooterFreshness freshness={freshness} now={now} onOpen={() => props.onOpenMenu('freshness')} />
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
  loaded,
  onSelect,
  fuel,
  onFuel,
  now,
}: {
  selection: Selection;
  data: Datasets;
  loaded: boolean;
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
      {resolved?.kind === 'storage' && <StorageDetail item={resolved.item} data={data} />}
      {resolved?.kind === 'lng' && <LngDetail item={resolved.item} data={data} now={now} />}
      {resolved?.kind === 'terminal' && <OilTerminalDetail item={resolved.item} data={data} now={now} onSelect={onSelect} />}
      {resolved?.kind === 'region' && <RegionDetail item={resolved.item} data={data} onSelect={onSelect} fuel={fuel} onFuel={onFuel} />}
      {!resolved && (
        <section className="section">
          <p className="muted">{KIND_LABELS[selection.kind]}</p>
          <h2 className="detail__title mono">{selection.id}</h2>
          <p className="muted">{loaded ? 'Not in the loaded data.' : 'Loading'}</p>
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

/** A window with a sidebar: the panel itself. */
export function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 3v10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
