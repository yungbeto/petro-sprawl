import { useEffect, useRef } from 'react';
import { BASEMAP_CREDITS, DATASET_FRESHNESS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { formatAge, type Freshness } from '../lib/freshness';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';

export type MenuSection = 'freshness';

interface AppMenuProps {
  onClose: () => void;
  /** Scroll to this section on open, for example from the footer's "Updated" line. */
  section: MenuSection | null;
  data: Datasets;
  freshness: Freshness[];
  now: Date;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const SHORTCUTS: [string, string][] = [
  ['/', 'Search'],
  ['Esc', 'Back, or close this menu'],
  ['[', 'Minimize or reopen the panel'],
  ['L', 'Show or hide the layer list'],
];

/** App-level settings and information, in a drawer over everything, like a map app's main menu. */
export function AppMenu({ onClose, section, data, freshness, now, themePreference, onThemePreferenceChange }: AppMenuProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (section) document.getElementById(`menu-${section}`)?.scrollIntoView({ block: 'start' });
    closeRef.current?.focus({ preventScroll: Boolean(section) });
  }, [section]);

  return (
    <>
      <div className="menu-scrim" onClick={onClose} aria-hidden="true" />
      <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
        <header className="menu__header">
          <h2 className="menu__title">Energy terminal</h2>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close menu" title="Close  Esc">
            <CloseIcon />
          </button>
        </header>
        <div className="menu__body">
          <section className="section">
            <h2 className="section__title">Appearance</h2>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEME_PREFERENCES.map((preference) => (
                <button
                  key={preference}
                  type="button"
                  role="radio"
                  aria-checked={themePreference === preference}
                  className="segmented__option"
                  onClick={() => onThemePreferenceChange(preference)}
                >
                  {THEME_LABELS[preference]}
                </button>
              ))}
            </div>
          </section>

          <FreshnessSection freshness={freshness} now={now} />
          <SourcesSection data={data} />

          <section className="section">
            <h2 className="section__title">Keyboard shortcuts</h2>
            <dl className="shortcuts">
              {SHORTCUTS.map(([key, action]) => (
                <div key={key} className="shortcuts__row">
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="section">
            <h2 className="section__title">About</h2>
            <p className="muted">
              A personal, map-first terminal for reading world events through energy flows. It keeps capacity, status and
              flow apart, and backs every status with a dated, sourced claim. Anything that can't be sourced shows as
              unknown.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FreshnessSection({ freshness, now }: { freshness: Freshness[]; now: Date }) {
  return (
    <section className="section" id="menu-freshness">
      <h2 className="section__title">Data freshness</h2>
      {freshness.length === 0 ? (
        <p className="muted">No datasets loaded.</p>
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
  );
}

/** Every dataset's source and terms, as each job recorded them in its meta file. */
function SourcesSection({ data }: { data: Datasets }) {
  const metas = [...data.meta].sort((a, b) =>
    (DATASET_FRESHNESS[a.id]?.label ?? a.id).localeCompare(DATASET_FRESHNESS[b.id]?.label ?? b.id),
  );
  return (
    <section className="section">
      <h2 className="section__title">Sources</h2>
      <ul className="sources">
        {metas.map((m) => (
          <li key={m.id}>
            <span>{DATASET_FRESHNESS[m.id]?.label ?? m.id}:</span>{' '}
            {/^https?:\/\//.test(m.sourceUrl) ? (
              <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                {DATASET_FRESHNESS[m.id]?.publisher ?? new URL(m.sourceUrl).hostname}
              </a>
            ) : (
              <span>hand-curated, with sources cited on each record</span>
            )}
            <span className="sources__license">{m.license}</span>
          </li>
        ))}
        <li>
          <span>Basemap:</span>{' '}
          {BASEMAP_CREDITS.map((c, i) => (
            <span key={c.url}>
              {i > 0 && ', '}
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.label}
              </a>
            </span>
          ))}
        </li>
      </ul>
    </section>
  );
}
