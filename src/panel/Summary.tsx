import { useMemo, type ReactNode } from 'react';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { BASEMAP_CREDITS, DATASET_FRESHNESS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { formatCountry, formatDate, formatIndex, formatIndexShare, formatNumber } from '../lib/format';
import { formatAge, type Freshness } from '../lib/freshness';
import { chokepointRows, corridorRows, statusCounts, storageRows, type Change } from '../lib/summary';
import { Band, statusLabel } from './details';

type OnSelect = (selection: Selection) => void;

interface SummaryProps {
  data: Datasets;
  loaded: boolean;
  failed: string[];
  freshness: Freshness[];
  visit: VisitChanges | null;
  now: Date;
  onSelect: OnSelect;
}

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;
const pct = (value: number) => `${formatNumber(value, 1)}%`;

export function Summary({ data, loaded, failed, freshness, visit, now, onSelect }: SummaryProps) {
  const counts = useMemo(() => statusCounts(data.pipelines), [data]);
  const corridor = useMemo(() => corridorRows(data.pipelines, now), [data, now]);
  const chokepoints = useMemo(() => chokepointRows(data), [data]);
  const storage = useMemo(() => storageRows(data), [data]);

  if (!loaded) {
    return <p className="muted">Loading data</p>;
  }

  const offBaseline = chokepoints.filter((c) => c.band && c.band !== 'near');
  const withLastYear = storage.filter((s) => s.vsLastYear !== null);
  const belowLastYear = withLastYear.filter((s) => s.vsLastYear! < 0);

  return (
    <>
      {failed.length > 0 && (
        <section className="section notice" role="alert">
          <p>
            Couldn't load {listOf(failed.map((id) => DATASET_FRESHNESS[id]?.label.toLowerCase() ?? id))}. The map shows
            everything else. Reload to try again.
          </p>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Theater</h2>
        <dl className="glance">
          <div className="glance__row">
            <dt>Pipelines</dt>
            <dd>
              {counts.length ? (
                <ul className="count-list">
                  {counts.map(({ status, count }) => (
                    <li key={status}>
                      <span className={`status status--${status}`}>{statusLabel(status)}</span>
                      <span className="mono num">{count.toLocaleString('en-US')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">None loaded</span>
              )}
            </dd>
          </div>
          <div className="glance__row">
            <dt>Chokepoints</dt>
            <dd>
              {chokepoints.length ? (
                <>
                  <span className="mono">{offBaseline.length}</span> of <span className="mono">{chokepoints.length}</span>{' '}
                  away from their five-year baseline
                </>
              ) : (
                <span className="muted">No transit data</span>
              )}
            </dd>
          </div>
          <div className="glance__row">
            <dt>EU gas storage</dt>
            <dd>
              {withLastYear.length ? (
                <>
                  <span className="mono">{belowLastYear.length}</span> of <span className="mono">{withLastYear.length}</span>{' '}
                  countries below the same date last year
                </>
              ) : (
                <span className="muted">No storage data</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <ChangesSection visit={visit} onSelect={onSelect} />

      {chokepoints.length > 0 && (
        <section className="section">
          <h2 className="section__title">Chokepoints</h2>
          <table className="table rows">
            <thead>
              <tr>
                <th>Chokepoint</th>
                <th>Transits, last 7 days</th>
                <th className="num">Index</th>
              </tr>
            </thead>
            <tbody>
              {chokepoints.map((c) => (
                <LinkRow key={c.selection.id} selection={c.selection} onSelect={onSelect} label={c.name}>
                  <td className="rows__meta">
                    <Band band={c.band} />
                  </td>
                  <td className="mono num" title={`Against the ${c.baseline} average`}>
                    {c.index !== null ? formatIndex(c.index) : 'n/a'}
                  </td>
                </LinkRow>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {corridor.length > 0 && (
        <section className="section">
          <h2 className="section__title">Corridor pipelines</h2>
          <table className="table rows">
            <tbody>
              {corridor.map((p) => (
                <LinkRow key={p.selection.id} selection={p.selection} onSelect={onSelect} label={p.name}>
                  <td className="rows__meta">
                    <span className={`status status--${p.status}`}>{statusLabel(p.status)}</span>
                    {p.measured && <span className="muted"> · metered</span>}
                    {p.unverifiedSince && (
                      <span className="unverified" title="The latest claim is past the aging threshold">
                        {' '}
                        · unverified since {p.unverifiedSince}
                      </span>
                    )}
                  </td>
                </LinkRow>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {storage.length > 0 && (
        <section className="section">
          <h2 className="section__title">EU gas storage</h2>
          <table className="table rows">
            <thead>
              <tr>
                <th>Country</th>
                <th className="num">Fill</th>
                <th className="num">Vs last year</th>
              </tr>
            </thead>
            <tbody>
              {storage.map((s) => (
                <LinkRow key={s.country} selection={s.selection} onSelect={onSelect} label={formatCountry(s.country)}>
                  <td className="mono num" title={`On ${s.latestDate}`}>
                    {pct(s.fill)}
                  </td>
                  <td className="mono num">{s.vsLastYear !== null ? pts(s.vsLastYear) : 'n/a'}</td>
                </LinkRow>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <FreshnessSection freshness={freshness} now={now} />
      <SourcesSection data={data} />
    </>
  );
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** A table row whose first cell opens the asset. The whole row is clickable; the button carries focus. */
function LinkRow({
  selection,
  label,
  onSelect,
  children,
}: {
  selection: Selection;
  label: string;
  onSelect: OnSelect;
  children: ReactNode;
}) {
  return (
    <tr className="rows__row" onClick={() => onSelect(selection)}>
      <td>
        <button
          type="button"
          className="link-button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(selection);
          }}
        >
          {label}
        </button>
      </td>
      {children}
    </tr>
  );
}

function ChangesSection({ visit, onSelect }: { visit: VisitChanges | null; onSelect: OnSelect }) {
  return (
    <section className="section">
      <h2 className="section__title">What changed since last visit</h2>
      {!visit?.since ? (
        <p className="muted">First visit on this browser. Changes show from your next visit.</p>
      ) : (
        <>
          <p className="muted section__lede">
            Last visit <span className="mono">{formatDate(visit.since)}</span> at{' '}
            <span className="mono">{visit.since.slice(11, 16)} UTC</span>
          </p>
          {visit.changes.length === 0 ? (
            <p className="muted">No changes worth noting.</p>
          ) : (
            <ul className="changes">
              {visit.changes.map((change) => (
                <li key={`${change.kind}/${change.selection.kind}/${change.selection.id}`}>
                  <button type="button" className="change" onClick={() => onSelect(change.selection)}>
                    <span className="change__name">{change.name}</span>
                    <span className="change__what">{describeChange(change)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function describeChange(change: Change): string {
  switch (change.kind) {
    case 'status':
      return `Status ${statusLabel(change.from).toLowerCase()} → ${statusLabel(change.to).toLowerCase()}`;
    case 'band': {
      const band = (b: typeof change.from) => (b ? `${b} baseline` : 'no index');
      return `Transits ${band(change.from)} → ${band(change.to)}`;
    }
    case 'flow-share':
      return `Metered flow ${formatIndexShare(change.from)} → ${formatIndexShare(change.to)} of capacity`;
    case 'storage':
      return `Storage ${pct(change.from)} → ${pct(change.to)}`;
    case 'disruption':
      return `New disruption from ${change.startedAt}`;
  }
}

function FreshnessSection({ freshness, now }: { freshness: Freshness[]; now: Date }) {
  return (
    <section className="section">
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
