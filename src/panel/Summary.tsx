import { useMemo, type ReactNode } from 'react';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { DATASET_FRESHNESS } from '../lib/config';
import { fuelOriginsFor, type Datasets } from '../lib/data';
import { formatCountry, formatDate, formatIndex, formatIndexShare, formatNumber } from '../lib/format';
import { chokepointRows, corridorRows, statusCounts, storageRows, type Change } from '../lib/summary';
import { Band, statusLabel } from './details';
import { Dashboard } from './Dashboard';
import { AssetIcon } from './AssetIcon';
import type { Commodity } from '../types';
import type { FilterId } from '../lib/filters';

type OnSelect = (selection: Selection) => void;

interface SummaryProps {
  data: Datasets;
  loaded: boolean;
  failed: string[];
  visit: VisitChanges | null;
  now: Date;
  onSelect: OnSelect;
  onFilter: (filter: FilterId) => void;
  onShowStorage: () => void;
}

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;
const pct = (value: number) => `${formatNumber(value, 1)}%`;

export function Summary({ data, loaded, failed, visit, now, onSelect, onFilter, onShowStorage }: SummaryProps) {
  const counts = useMemo(() => statusCounts(data.pipelines), [data]);
  const corridor = useMemo(() => corridorRows(data.pipelines, now), [data, now]);
  const chokepoints = useMemo(() => chokepointRows(data), [data]);
  const storage = useMemo(() => storageRows(data), [data]);
  const regions = useMemo(
    () =>
      data.oilOrigins.flatMap((region) => {
        const top = fuelOriginsFor(data, region.id, 'gasoline')?.rows[0];
        return top ? [{ region, top }] : [];
      }),
    [data],
  );

  if (!loaded) {
    return <p className="muted">Loading data</p>;
  }

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

      <Dashboard
        counts={counts}
        chokepoints={chokepoints}
        storage={storage}
        visit={visit}
        onFilter={onFilter}
        onShowStorage={onShowStorage}
        onShowChanges={() => document.getElementById('summary-changes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <ChangesSection visit={visit} onSelect={onSelect} commodityOf={(id) => data.pipelines.find((p) => p.id === id)?.commodity} />

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

      {regions.length > 0 && (
        <section className="section">
          <h2 className="section__title">Where is my oil from?</h2>
          <p className="muted section__lede">Where each US fuel region's gasoline comes from. Search a ZIP code, city or state to find yours.</p>
          <table className="table rows">
            <thead>
              <tr>
                <th>Region</th>
                <th>Largest gasoline source</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(({ region, top }) => (
                <LinkRow key={region.id} selection={{ kind: 'region', id: region.id }} onSelect={onSelect} label={region.name}>
                  <td className="rows__meta">
                    {top.kind === 'own' ? 'Made in the region' : top.label}
                  </td>
                  <td className="mono num">{Math.round(top.share * 100)}%</td>
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

function ChangesSection({
  visit,
  onSelect,
  commodityOf,
}: {
  visit: VisitChanges | null;
  onSelect: OnSelect;
  commodityOf: (pipelineId: string) => Commodity | undefined;
}) {
  return (
    <section className="section" id="summary-changes">
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
                    <AssetIcon kind={change.selection.kind} commodity={commodityOf(change.selection.id)} />
                    <span className="change__text">
                      <span className="change__name">{change.name}</span>
                      <span className="change__what">{describeChange(change)}</span>
                    </span>
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
