import { useMemo } from 'react';
import { HomeSkeleton } from './Skeleton';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { DATASET_FRESHNESS, FEATURES } from '../lib/config';
import type { Datasets } from '../lib/data';
import { formatDate, formatIndexShare, formatNumber } from '../lib/format';
import { chokepointRows, countStatuses, statusCounts, storageRows, type Change } from '../lib/summary';
import { lngStatus, terminalStatus } from '../lib/encoding';
import { statusLabel } from './details';
import { Dashboard } from './Dashboard';
import { HomeHero } from './HomeHero';
import { AssetIcon } from './AssetIcon';
import type { Commodity } from '../types';
import type { ViewId } from '../lib/views';

type OnSelect = (selection: Selection) => void;

interface SummaryProps {
  data: Datasets;
  loaded: boolean;
  failed: string[];
  visit: VisitChanges | null;
  now: Date;
  onSelect: OnSelect;
  onOpenView: (view: ViewId) => void;
}

const pct = (value: number) => `${formatNumber(value, 1)}%`;

export function Summary({ data, loaded, failed, visit, now, onSelect, onOpenView }: SummaryProps) {
  const counts = useMemo(() => statusCounts(data.pipelines), [data]);
  const terminalCounts = useMemo(
    () => countStatuses([...data.lngTerminals.map(lngStatus), ...data.oilTerminals.map(terminalStatus)]),
    [data],
  );
  const chokepoints = useMemo(() => chokepointRows(data), [data]);
  const storage = useMemo(() => storageRows(data), [data]);

  if (!loaded) return <HomeSkeleton />;

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

      <HomeHero
        data={data}
        visit={visit}
        now={now}
        onSelect={onSelect}
        onShowChanges={() => document.getElementById('summary-changes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <Dashboard counts={counts} terminalCounts={terminalCounts} chokepoints={chokepoints} storage={storage} basins={data.basins} onOpenView={onOpenView} />

      {FEATURES.visitChanges && (
        <ChangesSection visit={visit} onSelect={onSelect} commodityOf={(id) => data.pipelines.find((p) => p.id === id)?.commodity} />
      )}

    </>
  );
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
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
