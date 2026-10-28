import type { Ref } from 'react';
import type { Selection, SelectionKind } from '../app/urlState';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';

interface PanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selection: Selection | null;
  onBack: () => void;
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
          <DetailShell selection={props.selection} onBack={props.onBack} />
        ) : (
          <SummaryShell />
        )}
      </div>

      <footer className="panel__footer">
        <p className="muted">No datasets loaded yet</p>
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

function SummaryShell() {
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
        <p className="muted">No datasets loaded yet.</p>
      </section>
    </>
  );
}

function DetailShell({ selection, onBack }: { selection: Selection; onBack: () => void }) {
  return (
    <>
      <button type="button" className="text-button" onClick={onBack} title="Back  Esc">
        <ChevronIcon direction="left" /> Back
      </button>
      <section className="section">
        <p className="muted">{KIND_LABELS[selection.kind]}</p>
        <h2 className="detail__title mono">{selection.id}</h2>
        <p className="muted">No data loaded for this item yet.</p>
      </section>
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
