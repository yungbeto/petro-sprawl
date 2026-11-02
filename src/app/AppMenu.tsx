import { ArrowRightIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BASEMAP_CREDITS, DATASET_FRESHNESS, GLOBE, SITE } from '../lib/config';
import type { Datasets } from '../lib/data';
import { formatDate } from '../lib/format';
import { formatAge, formatUtcClock, overallFreshness, type Freshness } from '../lib/freshness';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';
import { Globe } from './Globe';
import { useIsPhone } from './useSheet';

export type MenuSection = 'about' | 'data' | 'settings';

const TABS: { id: MenuSection; label: string }[] = [
  { id: 'about', label: 'About' },
  { id: 'data', label: 'Data' },
  { id: 'settings', label: 'Settings' },
];

interface AppMenuProps {
  onClose: () => void;
  /** The tab to open on, for example Data from the footer's "Updated" line. */
  section: MenuSection | null;
  data: Datasets;
  freshness: Freshness[];
  now: Date;
  theme: string;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const SHORTCUTS: [string, string][] = [
  ['/', 'Search (or ⌘K)'],
  ['Esc', 'Back, or close this menu'],
  ['[', 'Minimize or reopen the panel'],
  ['L', 'Show or hide the layer list'],
];

/**
 * The app menu: a full screen page over everything, like a product page. A hero with the globe and what the
 * app is, tabs for About, Data and Settings, and a footer with the contact address and the credits.
 */
export function AppMenu({ onClose, section, data, freshness, now, theme, themePreference, onThemePreferenceChange }: AppMenuProps) {
  const phone = useIsPhone();
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<MenuSection, HTMLButtonElement | null>>>({});
  const [tab, setTab] = useState<MenuSection>(section ?? 'about');

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    // Opened at a tab (Help, the footer's "Updated", the rail's settings): bring the tabs to the top.
    if (section) tabsRef.current?.scrollIntoView({ block: 'start' });
  }, [section]);

  const showTab = (next: MenuSection, focus = false) => {
    setTab(next);
    if (focus) tabRefs.current[next]?.focus();
  };
  const jumpToTab = (next: MenuSection) => {
    setTab(next);
    tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    tabRefs.current[next]?.focus({ preventScroll: true });
  };

  // Arrow keys move along the tabs, as a tab list does.
  const onTabKey = (event: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const to =
      event.key === 'ArrowRight' ? (i + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : null;
    if (to === null) return;
    event.preventDefault();
    showTab(TABS[to]!.id, true);
  };

  const counts: [number, string][] = [
    [data.pipelines.length, 'pipelines'],
    [data.lngTerminals.length, 'LNG terminals'],
    [data.oilTerminals.length, 'oil terminals'],
    [data.chokepoints.length, 'chokepoints'],
    [data.basins.length, 'basins'],
  ];
  const loaded = counts.some(([n]) => n > 0);

  return (
    <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <header className="menu__bar">
        <div className="menu__inner menu__bar-inner">
          <span className="menu__brand">
            <Globe size={GLOBE.size} dots={GLOBE.dots} className="brand-mark" theme={theme} />
            {SITE.name}
          </span>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close menu" title="Close  Esc">
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="menu__scroll">
        <section className="menu__hero" aria-labelledby="menu-tagline">
          <div className="menu__inner menu__hero-inner">
            <div className="menu__hero-text">
              <h2 id="menu-tagline" className="menu__tagline">
                {SITE.tagline}
              </h2>
              <p className="menu__lede">
                Pipelines, terminals, chokepoints and basins on one map, with what is moving through them now. Every
                status carries a dated source, and anything that can't be sourced says unknown.
              </p>
              {loaded && (
                <ul className="menu__counts" aria-label="On the map">
                  {counts.map(([n, label]) => (
                    <li key={label}>
                      <span className="menu__count mono">{n.toLocaleString('en-US')}</span>
                      <span className="menu__count-label">{label}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="menu__cta" onClick={onClose}>
                Open the map
                <ArrowRightIcon size={16} aria-hidden="true" />
              </button>
            </div>
            <Globe
              size={phone ? GLOBE.hero.phoneSize : GLOBE.hero.size}
              dots={GLOBE.hero.dots}
              fill={GLOBE.hero.fill}
              secondsPerTurn={GLOBE.hero.secondsPerTurn}
              className="menu__globe"
              theme={theme}
            />
          </div>
        </section>

        <div ref={tabsRef} className="menu__tabs">
          <div className="menu__inner">
            <div className="menu__tablist" role="tablist" aria-label="Menu sections" onKeyDown={onTabKey}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`menu-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`menu-panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  className="menu__tab"
                  onClick={() => showTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="menu__inner menu__body" role="tabpanel" id={`menu-panel-${tab}`} aria-labelledby={`menu-tab-${tab}`}>
          {tab === 'about' && <AboutTab />}
          {tab === 'data' && (
            <div className="menu__columns">
              <FreshnessSection freshness={freshness} now={now} />
              <SourcesSection data={data} />
            </div>
          )}
          {tab === 'settings' && (
            <div className="menu__columns">
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
            </div>
          )}
        </div>

        <MenuFooter theme={theme} freshness={freshness} now={now} onData={() => jumpToTab('data')} />
      </div>
    </div>
  );
}

const PRINCIPLES: [string, string][] = [
  [
    'Capacity, status and flow, kept apart',
    'What a line could carry, whether it is running and what is measured going through it are three facts, each with its own source.',
  ],
  [
    'Every status has a source',
    'A status links to a dated report or to a measured flow. With neither, it shows as unknown rather than a guess.',
  ],
  [
    'Updated through the day',
    'Flows, tanker transits and storage are fetched every 6 hours. A news scan every 12 hours adds sources and disruptions, marked unreviewed until someone checks them.',
  ],
];

function AboutTab() {
  return (
    <>
      <section className="section menu__why">
        <h2 className="section__title">Why</h2>
        <p>
          The movement of energy explains a lot about why international decisions get made, alliances form and ruptures
          happen. {SITE.name} puts that structure on a map, so a headline lands on the pipeline, the strait or the basin
          it touches, and stays a real happening in a real place.
        </p>
      </section>
      <ul className="menu__principles">
        {PRINCIPLES.map(([title, body]) => (
          <li key={title}>
            <h3 className="menu__principle-title">{title}</h3>
            <p className="muted">{body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function MenuFooter({ theme, freshness, now, onData }: { theme: string; freshness: Freshness[]; now: Date; onData: () => void }) {
  const overall = overallFreshness(freshness);
  return (
    <footer className="menu__footer">
      <div className="menu__inner menu__footer-inner">
        <div className="menu__footer-brand">
          <span className="menu__brand">
            <Globe size={GLOBE.size} dots={GLOBE.dots} className="brand-mark" theme={theme} />
            {SITE.name}
          </span>
          <p className="muted">{SITE.tagline}</p>
        </div>
        <div className="menu__footer-col">
          <h2 className="menu__footer-title">Contact</h2>
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          <p className="muted">Corrections, takedown requests and feedback</p>
        </div>
        <div className="menu__footer-col">
          <h2 className="menu__footer-title">Data</h2>
          {overall ? (
            <button type="button" className="menu__footer-link" onClick={onData}>
              {overall.scheduled
                ? `Updated ${formatAge(overall.fetchedAt, now)} · ${formatUtcClock(overall.fetchedAt)}`
                : `Imported ${formatDate(overall.fetchedAt)}`}
            </button>
          ) : (
            <p className="muted">Loading data</p>
          )}
          <p className="muted">From public sources, each credited under Data</p>
        </div>
        <div className="menu__footer-col">
          <h2 className="menu__footer-title">Made by</h2>
          <a href={SITE.maker.url} target="_blank" rel="noreferrer">
            {SITE.maker.name}
          </a>
        </div>
      </div>
    </footer>
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
              <span>{DATASET_FRESHNESS[m.id]?.publisher ?? 'Curated'}, with sources cited on each record</span>
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
