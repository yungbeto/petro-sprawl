import type { Selection, SelectionKind } from '../app/urlState';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';
import { resolveSelection, type Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { datasetFreshness, formatAge, formatUtcClock, overallFreshness, sortFreshness, type Freshness } from '../lib/freshness';
import { useNow } from '../app/useNow';
import type { VisitChanges } from '../app/useVisitChanges';
import { Summary } from './Summary';
import { FilterList } from './FilterList';
import type { FilterId, FilterMatches } from '../lib/filters';
import { BasinDetail, ChokepointDetail, PipelineDetail, StorageDetail } from './details';

interface PanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onBack: () => void;
  data: Datasets;
  loaded: boolean;
  failed: string[];
  visit: VisitChanges | null;
  filter: FilterId | null;
  matches: FilterMatches | null;
  onClearFilter: () => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}

const KIND_LABELS: Record<SelectionKind, string> = {
  pipeline: 'Pipeline',
  chokepoint: 'Chokepoint',
  basin: 'Basin',
  storage: 'Gas storage',
};

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function Panel(props: PanelProps) {
  const { collapsed, onToggleCollapsed } = props;
  const now = useNow();
  const freshness = sortFreshness(props.data.meta.map((m) => datasetFreshness(m, now)));

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
            onBack={props.onBack}
            now={now}
          />
        ) : props.filter && props.matches ? (
          <FilterList
            filter={props.filter}
            matches={props.matches}
            data={props.data}
            onSelect={props.onSelect}
            onClear={props.onClearFilter}
          />
        ) : (
          <Summary
            data={props.data}
            loaded={props.loaded}
            failed={props.failed}
            freshness={freshness}
            visit={props.visit}
            now={now}
            onSelect={props.onSelect}
          />
        )}
      </div>

      <footer className="panel__footer">
        <FooterFreshness freshness={freshness} now={now} />
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEME_PREFERENCES.map((preference) => (
            <button
              key={preference}
              type="button"
              role="radio"
              aria-checked={props.themePreference === preference}
              className="segmented__option"
              onClick={() => props.onThemePreferenceChange(preference)}
            >
              {THEME_LABELS[preference]}
            </button>
          ))}
        </div>
      </footer>
    </aside>
  );
}

function FooterFreshness({ freshness, now }: { freshness: Freshness[]; now: Date }) {
  const overall = overallFreshness(freshness);
  if (!overall) return <p className="muted">No datasets loaded yet</p>;
  const warn = freshness.some((f) => f.stale || f.failedAt);
  const text = overall.scheduled
    ? `Updated ${formatAge(overall.fetchedAt, now)} · ${formatUtcClock(overall.fetchedAt)}`
    : `Imported ${formatDate(overall.fetchedAt)}`;
  return (
    <p className={warn ? 'freshness--warn' : 'muted'} title={warn ? 'Some data is stale or failed to update' : undefined}>
      <span className="mono">{text}</span>
      {warn && ' · some data stale'}
    </p>
  );
}

function Detail({
  selection,
  data,
  loaded,
  onSelect,
  onBack,
  now,
}: {
  selection: Selection;
  data: Datasets;
  loaded: boolean;
  now: Date;
  onSelect: (selection: Selection) => void;
  onBack: () => void;
}) {
  const resolved = resolveSelection(selection, data);
  return (
    <>
      <button type="button" className="text-button" onClick={onBack} title="Back  Esc">
        <ChevronIcon direction="left" /> Back
      </button>
      {resolved?.kind === 'chokepoint' && <ChokepointDetail item={resolved.item} data={data} />}
      {resolved?.kind === 'basin' && <BasinDetail item={resolved.item} data={data} onSelect={onSelect} />}
      {resolved?.kind === 'pipeline' && <PipelineDetail item={resolved.item} data={data} now={now} />}
      {resolved?.kind === 'storage' && <StorageDetail item={resolved.item} data={data} />}
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
