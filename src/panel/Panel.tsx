import type { Ref } from 'react';
import type { Selection, SelectionKind } from '../app/urlState';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';
import { resolveSelection, type Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { datasetFreshness, formatAge, formatUtcClock, overallFreshness, sortFreshness, type Freshness } from '../lib/freshness';
import { useNow } from '../app/useNow';
import { BasinDetail, ChokepointDetail, PipelineDetail, StorageDetail } from './details';

interface PanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onBack: () => void;
  data: Datasets;
  loaded: boolean;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  searchRef: Ref<HTMLInputElement>;
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

  if (collapsed) {
    return (
      <aside className="panel panel--collapsed" aria-label="Panel (collapsed)">
        <button
          type="button"
          className="icon-button"
          onClick={onToggleCollapsed}
          aria-label="Expand panel"
          title="Expand panel  ["
        >
          <ChevronIcon direction="right" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="panel" aria-label="Panel">
      <header className="panel__header">
        <h1 className="panel__title">Energy terminal</h1>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleCollapsed}
          aria-label="Collapse panel"
          title="Collapse panel  ["
        >
          <ChevronIcon direction="left" />
        </button>
      </header>

      <div className="panel__search">
        <input
          ref={props.searchRef}
          type="search"
          className="search-input"
          placeholder="Search pipelines, chokepoints, basins, countries"
          aria-label="Search"
        />
        <kbd className="search-hint" aria-hidden="true">/</kbd>
      </div>

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
        ) : (
          <Summary freshness={freshness} loaded={props.loaded} now={now} />
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
      {warn && ' · check data freshness'}
    </p>
  );
}

function Summary({ freshness, loaded, now }: { freshness: Freshness[]; loaded: boolean; now: Date }) {
  return (
    <>
      <section className="section">
        <h2 className="section__title">Theater</h2>
        <p>Europe, Russia, the Caspian, North Africa and the Middle East, plus the seven major oil chokepoints.</p>
      </section>
      <section className="section">
        <h2 className="section__title">What changed since last visit</h2>
        <p className="muted">Nothing to compare yet.</p>
      </section>
      <section className="section">
        <h2 className="section__title">Data freshness</h2>
        {!loaded ? (
          <p className="muted">Loading</p>
        ) : freshness.length === 0 ? (
          <p className="muted">No datasets loaded yet.</p>
        ) : (
          <table className="table freshness">
            <thead>
              <tr>
                <th>Dataset</th>
                <th className="num">Updated</th>
                <th className="num">Data through</th>
              </tr>
            </thead>
            <tbody>
              {freshness.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.label}
                    {f.stale && <span className="freshness__flag"> stale</span>}
                    {f.failedAt && (
                      <span className="freshness__flag" title={`Last fetch failed at ${f.failedAt}; showing the previous data`}>
                        {' '}
                        fetch failed {formatAge(f.failedAt, now)}
                      </span>
                    )}
                  </td>
                  <td className={`mono num${f.stale ? ' freshness--warn' : ''}`} title={f.fetchedAt}>
                    {f.scheduled ? formatAge(f.fetchedAt, now) : formatDate(f.fetchedAt)}
                  </td>
                  <td className="mono num">{f.dataThrough ?? <span className="muted">n/a</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
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
